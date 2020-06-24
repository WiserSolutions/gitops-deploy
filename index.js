const core = require('@actions/core');

const yaml = require('js-yaml');

const _set = require('lodash.set');

async function readPath(repo, tree, path) {
  const parts = path.split('/').split('\\');

  const cur = tree;
  for(const p,i of parts.slice(0, parts.length - 1)) {
    cur = await repo.loadAs('tree', cur[p].hash);
  }

  return {
    mode: cur[parts[parts.length - 1]].mode,
    contents: await repo.loadAs('text', cur[parts[parts.length - 1]].hash)
  };
}

try {

  const repo = {};

  require('js-github/mixins/github-db')(repo);
  require('js-git/mixins/create-tree')(repo);
  require('js-git/mixins/formats')(repo);

  const versionToSet = core.getInput('new-version');
  const repoPath = core.getInput('path');

  var headHash = await repo.readRef("refs/heads/master");
  var commit = await repo.loadAs("commit", headHash);
  var tree = await repo.loadAs("tree", commit.tree);

  const {contents, mode} = await readPath(repo, tree, repoPath);

  const d = yaml.safeLoad(contents);

  // update the contents with the new data
  _set(d, repoPath, versionToSet);

  const newTree = [
    {
      [core.getInput('path')]: {
        mode: mode,
        content: yaml.safeDump(d)
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
    message: `${core.getState()}: new deploy (${versionToSet})`
  });

  await repo.updateRef("refs/heads/master", newCommitHash);

  core.setOutput("commit", newCommitHash);
} catch (error) {
  core.setFailed(error.message);
}