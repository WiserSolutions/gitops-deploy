GitOps Deploy for GitHub Actions
====

This repo provides a module to automatically update a version reference within a GitOps YAML repository. This can be combined with a GitOps compatible tools (such as [ArgoCD](https://argoproj.github.io/argo-cd/) or [Flux](https://fluxcd.io/)) to automatically deploy the latest app artifacts to your environments.

## Basic Usage

Add a step to your deployment workflow, after you have packaged your code (with Docker or otherwise):

```
    - uses: WiserSolutioons/gitops-deploy@v1
      with:
        repository: <my org>/<gitops repo>
        ref: test/prod/whatever
        path: kube/<my app>.yaml
        token: ${{ secrets.<some token for your CI user> }}

        field: 0.image.tag # or whatever the yaml field is where you put the version of your app
        new-version: <insert a variable with the new version of your app>
```

## Options Reference

| Name                     | Required | Description                                                      |
| ------------------------:|:--------:| ---------------------------------------------------------------- |
| `host`                   | no       | SSH host of your GitOps repository                               |
| `repository`             | yes      | Path of your GitHub repo (ex. Org/repo-name)                     |
| `ref`                    | yes      | Branch or Git identifier to commit on (including `refs/heads/`)  |
| `token`                  | yes      | Authentication for GitHub HTTP                                   |
| `path`                   | yes      | Path of the file which configures this service                   |
| `field`                  | yes      | Location within the YAML to insert the new version/tag, in [lodash.set syntax](https://lodash.com/docs/4.17.15#set) |
| `new-version`            | yes      | String which should be set as the new version in the given field |
| `retryCount`             | no       | Number of times to retry if commit fails due to remote conflicts |
