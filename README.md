GitOps Deploy for GitHub Actions
====

This repo provides a module to automatically update a version reference within a GitOps YAML repository. This can be combined with a GitOps compatible tools (such as [ArgoCD](https://argoproj.github.io/argo-cd/) or [Flux](https://fluxcd.io/)) to automatically deploy the latest app artifacts to your environments.

## Basic Usage

Add a step to your deployment workflow, after you have packaged your code (with Docker or otherwise):

```
    - uses: WiserSolutioons/gitops-deploy@v1
      with:
        repository: <my org>/<gitops repo>
        ref: test
        path: kube/<my app>.yaml
        token: ${{ secrets.<some token for your CI user> }}

        field: image.tag # or whatever the yaml field is where you put the version of your app
        new-version: <insert a variable with the new version of your app>
```

## Supported Options

TBC