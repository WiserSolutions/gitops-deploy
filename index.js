const util = require('util');

const core = require('@actions/core');

const yaml = require('js-yaml');

const {ECR, DescribeImagesCommand} = require('@aws-sdk/client-ecr');

const _get = require('lodash.get');
const _set = require('lodash.set');
const _last = require('lodash.last');

async function checkImageExists(repositoryName, registryId, newVersion) {
  // return True if the image exists
  const ecr = new ECR({region: core.getInput('aws-region')});

  try {
    await ecr.send(
      new DescribeImagesCommand({
        imageIds: [{ imageTag: registryId }],
        repositoryName: repositoryName,
        registryId: registryId})
    );
  }
  catch (err) {
    if (err.name == 'ImageNotFoundException') {
      return false;
    } else {
      // this exception is unknown, so rethrow it
      throw(err);
    }
  }
  return true;
}

async function shouldVerifyImage(repository) {
  return repository.includes('dkr.ecr') && core.getInput('aws-access-key-id');
}

async function splitRepositryPath(repository) {
  const registryId = repository.split('.')[0];
  const split_repo = foo.split('/');
  const short_repo = split_repo.slice(1).join('/');

  return [registryId, split_repo];
}

async function readPath(repo, tree, path) {
  const parts = path.split('/');

  let cur = tree;
  for(const p of parts.slice(0, parts.length - 1)) {
    cur = await util.promisify(repo.loadAs)('tree', cur[p].hash);
  }

  return {
    mode: cur[parts[parts.length - 1]].mode,
    contents: await util.promisify(repo.loadAs)('blob', cur[parts[parts.length - 1]].hash)
  };
}

async function makeRepo(repoString, token) {
  const repo = {};

  require('js-github/mixins/github-db')(repo, repoString, token);
  require('js-git/mixins/create-tree')(repo);
  //require('js-git/mixins/formats')(repo);

  return repo;
}

async function getContents(repo, repoPath, ref) {
  var commitHash = await util.promisify(repo.readRef)(ref);
  var commit = await util.promisify(repo.loadAs)('commit', commitHash);
  var tree = await util.promisify(repo.loadAs)('tree', commit.tree);

  const {contents, mode} = await readPath(repo, tree, repoPath);

  const d = yaml.safeLoadAll(contents);

  return { contents: d, mode, commit, commitHash };
}

async function run(callback) {
  try {

    const repo = await makeRepo(core.getInput('repository'), core.getInput('token'));

    const versionToSet = core.getInput('new-version');
    const repoPath = core.getInput('path');
    const ref = core.getInput('ref');

    console.log(`Updating ${repoPath} to version ${versionToSet}`);

    const { contents, mode, commit, commitHash } = await getContents(repo, repoPath, ref);

    const repository = _get(contents, core.getInput('repository-field'));
    if (shouldVerifyImage(repository)) {
      const [registryId, shortRepoName] = splitRepositryPath(repository);
      if (!checkImageExists(shortRepoName, registryId, versionToSet)) {
        console.error(`Failed to find image tag ${versionToSet} in ${repository}`);
      }
    }

    // update the contents with the new data
    let newData;
    const existingData = _get(contents, core.getInput('field'));
    if(existingData.indexOf(':') !== -1) {
        newData = existingData.substr(0, existingData.indexOf(':')) + ':' + versionToSet;
    } else {
        newData = versionToSet;
    }


    const newContents = _set(contents, core.getInput('field'), newData);

    console.log(newContents);

    const newFile = newContents.map((c) => yaml.safeDump(c, { noArrayIndent: true })).join('\n---\n');

    const newTree = [
      {
        path: repoPath,
        mode: mode,
        content: Buffer.from(newFile)
      }
    ];

    newTree.base = commit.tree;

    const newTreeHash = await util.promisify(repo.createTree)(newTree);

    console.log('created tree with hash:', newTreeHash);

    var newCommitHash = await util.promisify(repo.saveAs)('commit', {
      tree: newTreeHash,
      author: {
        name: 'GitOps CI',
        email: 'ci@example.com',
        date: { seconds: Math.floor(Date.now() / 1000), offset: 0 }
      },
      committer: {
        name: 'GitOps CI',
        email: 'ci@example.com',
        date: { seconds: Math.floor(Date.now() / 1000), offset: 0 }
      },
      parents: [commitHash],
      message: `${process.env['GITHUB_REPOSITORY'].split('/')[1]}: new deploy (${versionToSet})`
    });

    console.log('created commit with hash:', newCommitHash);

    await util.promisify(repo.updateRef)(ref, newCommitHash);

    console.log('updated ref');

    core.setOutput("commit", newCommitHash);
  } catch (error) {
    core.setFailed(util.inspect(error));
  }
}

if (module === require.main) {
  run();
}

module.exports = { readPath, makeRepo, getContents };
