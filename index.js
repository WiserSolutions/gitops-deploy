const core = require('@actions/core');

const yaml = require('js-yaml');

const _set = require('lodash.set');

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
  var headHash = await util.promisify(repo.readRef)(ref);
  var commit = await util.promisify(repo.loadAs)('commit', headHash);
  console.log(commit.tree);
  var tree = await util.promisify(repo.loadAs)('tree', commit.tree);

  const {contents, mode} = await readPath(repo, tree, repoPath);

  const d = yaml.safeLoadAll(contents);

  return { contents: d, mode }
}

async function writeContents() {

}

async function run(callback) {
  try {

    const repo = await makeRepo(core.getInput('repository'), core.getInput('token'));

    const versionToSet = core.getInput('new-version');
    const repoPath = core.getInput('path');
    const ref = core.getInput('ref');

    const { contents, mode } = await getContents(repo, repoPath, ref);

    // update the contents with the new data
    _set(contents, repoPath, versionToSet);

    const newTree = [
      {
        [repoPath]: {
          mode: mode,
          content: contents.map((c) => yaml.safeDump(c, { noArrayIndent: true })).join('\n---\n')
        }
      }
    ];

    newTree.base = commit.tree;

    const newTreeHash = await repo.createTree(newTree);

    var newCommitHash = await repo.saveAs("commit", {
      tree: newTreeHash,
      author: {
        name: "GitOps CI",
        email: "ci@example.com"
      },
      parent: headHash,
      message: `${process.env['GITHUB_REPOSITORY'].split('/')[1]}: new deploy (${versionToSet})`
    });

    await repo.updateRef(ref, newCommitHash);

    core.setOutput("commit", newCommitHash);
  } catch (error) {
    core.setFailed(error.message);
  }
}

if (module === require.main) {
  run();
}

module.exports = { readPath, makeRepo, getContents };