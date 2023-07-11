const util = require("util");

const core = require("@actions/core");

const yaml = require("js-yaml");
const promiseRetry = require("promise-retry");

const _get = require("lodash.get");
const _set = require("lodash.set");

async function readPath(repo, tree, path) {
  const parts = path.split("/");

  let cur = tree;
  for (const p of parts.slice(0, parts.length - 1)) {
    cur = await util.promisify(repo.loadAs)("tree", cur[p].hash);
  }

  return {
    mode: cur[parts[parts.length - 1]].mode,
    contents: await util.promisify(repo.loadAs)(
      "blob",
      cur[parts[parts.length - 1]].hash
    ),
  };
}

async function makeRepo(repoString, token) {
  const repo = {};

  require("js-github/mixins/github-db")(repo, repoString, token);
  require("js-git/mixins/create-tree")(repo);
  //require('js-git/mixins/formats')(repo);

  return repo;
}

async function getContents(repo, repoPath, ref) {
  var commitHash = await util.promisify(repo.readRef)(ref);
  var commit = await util.promisify(repo.loadAs)("commit", commitHash);
  var tree = await util.promisify(repo.loadAs)("tree", commit.tree);

  const { contents, mode } = await readPath(repo, tree, repoPath);

  const d = yaml.safeLoadAll(contents);

  return { contents: d, mode, commit, commitHash };
}

async function run(callback) {
  try {
    const retryCount = parseInt(core.getInput("retryCount") ?? 2);
    await promiseRetry(
      async function (retry) {
        const repo = await makeRepo(
          core.getInput("repository"),
          core.getInput("token")
        );

        const versionToSet = core.getInput("new-version");
        const repoPath = core.getInput("path");
        const ref = core.getInput("ref");

        if (!versionToSet) {
          throw new Error(
            "new-version is not set to anything, cannot update git"
          );
        }

        console.log(`Updating ${repoPath} to version ${versionToSet}`);

        let contents, mode, commit, commitHash;
        try {
          ({ contents, mode, commit, commitHash } = await getContents(
            repo,
            repoPath,
            ref
          ));
        } catch (err) {
          console.log(util.inspect(err));
          throw new Error(
            `could not read contents of configured gitops file, please make sure ${repoPath} exists!`
          );
        }

        // update the contents with the new data
        let newData;
        const existingData = _get(contents, core.getInput("field"));
        if (existingData.indexOf(":") !== -1) {
          newData =
            existingData.substr(0, existingData.indexOf(":")) +
            ":" +
            versionToSet;
        } else {
          newData = versionToSet;
        }

        if (newData == existingData) {
          console.log(
            "nothing to commit, deploy is already set on gitops repo."
          );
          return core.setOutput("commit", commitHash);
        }

        const newContents = _set(contents, core.getInput("field"), newData);

        console.log(newContents);

        const newFile = newContents
          .map((c) => yaml.safeDump(c, { noArrayIndent: true }))
          .join("\n---\n");

        const newTree = [
          {
            path: repoPath,
            mode: mode,
            content: Buffer.from(newFile),
          },
        ];

        newTree.base = commit.tree;

        const newTreeHash = await util.promisify(repo.createTree)(newTree);

        console.log("created tree with hash:", newTreeHash);

        var newCommitHash = await util.promisify(repo.saveAs)("commit", {
          tree: newTreeHash,
          author: {
            name: "GitOps CI",
            email: "ci@example.com",
            date: { seconds: Math.floor(Date.now() / 1000), offset: 0 },
          },
          committer: {
            name: "GitOps CI",
            email: "ci@example.com",
            date: { seconds: Math.floor(Date.now() / 1000), offset: 0 },
          },
          parents: [commitHash],
          message: `${
            process.env["GITHUB_REPOSITORY"].split("/")[1]
          }: new deploy (${versionToSet})`,
        });

        console.log("created commit with hash:", newCommitHash);
        try {
          await util.promisify(repo.updateRef)(ref, newCommitHash);
          console.log("updated ref");
          core.setOutput("commit", newCommitHash);
        } catch (error) {
          console.log("commit failed, retrying:", error);
          return retry();
        }
      },
      { minTimeout: 1000, retries: retryCount }
    );
  } catch (error) {
    core.setFailed(util.inspect(error));
  }
}

if (module === require.main) {
  run();
}

module.exports = { readPath, makeRepo, getContents };
