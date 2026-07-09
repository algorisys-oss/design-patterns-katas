---
id: infrastructure-as-code
category: deployment
sequence: 6
title: Infrastructure as Code
also_known_as: [IaC, Declarative Infrastructure]
gof: false
intent: "Define and provision infrastructure through version-controlled code that declares the desired state, so environments are reproducible, reviewable, and rebuildable instead of hand-configured."
frequency: high
difficulty: intermediate
tags: [deployment, devops, automation, reproducibility, gitops]
related: [sidecar, blue-green, immutability]
languages: [terraform, kubernetes, ansible, pulumi]
---

## Intent

Describe your infrastructure — servers, networks, databases, clusters, DNS — as **code** that declares the
**desired state**, and let a tool make reality match it. Instead of clicking through a console or SSH-ing to
configure servers by hand, you write it down, commit it to version control, review it, and apply it. The
tool figures out what to create, change, or destroy to reach the declared state.

This turns infrastructure into a software artifact: reproducible (rebuild an identical environment from the
code), reviewable (changes go through pull requests), auditable (git history is the change log), and
consistent (every environment comes from the same source). "Works on my server" becomes "works from the
code," and drift between environments disappears.

## The Problem

Manually provisioned and configured infrastructure is fragile and opaque:

- **Snowflake servers** — hand-configured environments no one can reproduce; if one dies, rebuilding it is
  archaeology.
- **Configuration drift** — staging and production diverge over time as people make one-off manual changes,
  so bugs appear in one and not the other.
- **No audit trail or review** — clicking in a console leaves no record of who changed what or why, and no
  chance to review before it happens.
- **Slow, error-prone, unscalable** — standing up a new environment by hand is slow and inconsistent; you
  can't do it repeatedly at scale.

## Structure

Key Components:

- **Declarative code** — files describing the desired infrastructure state (resources and their config).
- **Provisioner / Engine** — the tool (Terraform, etc.) that reconciles desired state with actual state.
- **State** — a record of what the tool currently manages, used to compute the diff.
- **Plan & apply** — preview the changes (plan), then execute them (apply).
- **Version control & CI** — the code lives in git; changes flow through review and pipelines.

```
IaC Code { desired state } ──plan──► Provisioner ──apply──► Infrastructure { actual state }
   (versioned, reviewed)     preview   (reconciles)  create/update/destroy to match desired
```

## When to Use

- You provision cloud/on-prem infrastructure and want it reproducible and reviewable.
- Multiple environments (dev/staging/prod) must stay consistent.
- Infrastructure changes should go through code review and CI like application code.
- You need to stand up, tear down, or clone environments repeatably.

## Advantages and Disadvantages

### Advantages
- **Reproducible** — rebuild an identical environment from code; no snowflakes.
- **Reviewable & auditable** — changes go through PRs; git history is the audit log.
- **Consistent & scalable** — every environment from one source; provision many the same way.

### Disadvantages
- **Learning curve & tooling** — new languages/tools, state management, and provider quirks to learn.
- **State management pitfalls** — the tool's state file can drift, corrupt, or conflict; it needs care
  (locking, remote backends).
- **Drift from out-of-band changes** — manual console changes diverge from the code, so discipline (no
  manual edits) is required.

## Common Mistakes

- **Manual changes alongside IaC** — editing infrastructure in the console behind the tool's back causes
  drift the next apply may revert or conflict with; make *all* changes through code.
- **Committing state or secrets** — the state file and secrets contain sensitive data; use remote encrypted
  backends and secret managers, never git.
- **No plan review** — applying without reading the plan can destroy/recreate resources unexpectedly; always
  review the diff.
- **Giant monolithic configs** — one massive stack for everything makes changes risky and slow; modularize
  and separate state by blast radius.

## Key Takeaways

- Declare infrastructure as versioned code; a tool reconciles reality to the desired state.
- You gain reproducibility, review/audit, and consistency across environments.
- Manage state carefully and make *all* changes through code to avoid drift.
- Always review the plan before applying; modularize to limit blast radius.

## Implementations

### Terraform

**❌ Naive**

```bash
# Provision by hand in the console/CLI — no record, not reproducible, drifts immediately.
aws ec2 run-instances --image-id ami-123 --instance-type t3.micro   # who ran this? what's the state?
```

**✅ Idiomatic**

```hcl
# Declarative, versioned resources; plan to preview, apply to reconcile.
resource "aws_instance" "web" {
  ami           = var.ami
  instance_type = "t3.micro"
  tags          = { Name = "web", Env = var.env }
}

resource "aws_db_instance" "db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  # ...
}
# terraform plan   → shows the diff (create/update/destroy)
# terraform apply  → makes reality match; state stored in a remote, locked backend
```

**🧠 Tradeoff** — Terraform's declarative HCL plus `plan`/`apply` is the canonical IaC: resources are
versioned and reviewable, `plan` previews the exact diff, and remote state (S3 + DynamoDB lock) coordinates
teams. It's cloud-agnostic via providers. The learning curve is state management — the state file is the
source of truth for what's managed, so remote backends, locking, and never editing it by hand are
essential. Do that, and environments become reproducible from code.

### Kubernetes

**❌ Naive**

```bash
# Imperative kubectl commands create resources with no manifest — not reproducible or reviewable.
kubectl run web --image=myapp:v1 --replicas=3   # gone from history the moment it's typed
```

**✅ Idiomatic**

```yaml
# Declarative manifests in git; GitOps (Argo CD/Flux) reconciles the cluster to them.
apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 3
  template:
    spec: { containers: [{ name: app, image: myapp:v1 }] }
# committed to git; Argo CD watches the repo and applies changes → the repo IS the desired state.
# kubectl apply -f (or GitOps) reconciles; drift is auto-corrected back to the manifest.
```

**🧠 Tradeoff** — Kubernetes is declarative IaC for workloads: manifests describe desired state and the
control loop continuously reconciles the cluster to match — and GitOps (Argo CD, Flux) makes the *git repo*
the source of truth, auto-correcting drift and turning every change into a reviewed PR. It's the reference
model for continuous reconciliation. The cost is the manifest sprawl and running the GitOps controllers, but
you get self-healing, auditable infrastructure.

### Ansible

**❌ Naive**

```bash
# SSH in and configure each server by hand — inconsistent across the fleet, no record.
ssh web01 "apt install nginx && systemctl enable nginx"   # repeated, differently, per host
```

**✅ Idiomatic**

```yaml
# A playbook declares the desired configuration; Ansible makes each host converge to it, idempotently.
- hosts: web
  tasks:
    - name: nginx installed and running
      ansible.builtin.apt: { name: nginx, state: present }
    - name: nginx enabled
      ansible.builtin.service: { name: nginx, state: started, enabled: true }
    - name: config in place
      ansible.builtin.template: { src: nginx.conf.j2, dest: /etc/nginx/nginx.conf }
      notify: reload nginx
# ansible-playbook site.yml → converges every host to the declared state, repeatably.
```

**🧠 Tradeoff** — Ansible brings IaC to *server configuration*: playbooks declare the desired package/
service/file state and idempotently converge each host, versioned in git and applied uniformly across a
fleet — no more per-server hand-tweaking. It's agentless (SSH) and readable. It shines for configuration
management (vs. Terraform's provisioning of cloud resources); many stacks use both — Terraform to create the
servers, Ansible to configure them.

### Pulumi

**❌ Naive**

```
# Clicking through the cloud console or ad-hoc SDK scripts with no desired-state model or diff.
```

**✅ Idiomatic**

```typescript
// IaC in a real programming language, with plan/apply semantics like Terraform.
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("assets", { versioning: { enabled: true } });
const web = new aws.ec2.Instance("web", {
  ami: amiId,
  instanceType: "t3.micro",
  tags: { Env: env },
});
export const bucketName = bucket.id;
// pulumi preview  (the plan)  ·  pulumi up  (apply) — desired state defined in TS/Python/Go.
```

**🧠 Tradeoff** — Pulumi (and the AWS CDK) let you write IaC in a general-purpose language (TypeScript,
Python, Go) with the same declarative desired-state + preview/apply model — so you get loops, functions, and
types for infrastructure, and can share code with your app. The trade versus Terraform's HCL is power vs.
constraint: real languages enable abstraction but also let you write imprecise, hard-to-review logic, so the
declarative discipline is on you. State management concerns are the same.

## Applications

- **Cloud provisioning** — Terraform/Pulumi/CloudFormation stand up VPCs, clusters, databases, and DNS
  reproducibly (backend).
- **Kubernetes GitOps** — Argo CD/Flux reconcile clusters to git-committed manifests (backend).
- **Server configuration** — Ansible/Chef/Puppet converge fleets to declared state (backend).
- **Environment parity** — dev/staging/prod built from the same code to eliminate drift (backend).
- **Disaster recovery** — rebuilding entire environments from code after a failure (backend).

## Related Patterns

- **Immutability** — IaC pairs with immutable infrastructure: rebuild from code rather than mutate in place,
  so servers are replaceable, not patched.
- **Blue-Green / Rolling** — IaC provisions the environments these deployment strategies switch between,
  codifying that they're truly identical.
- **Sidecar / Service Mesh** — the sidecar injection and mesh policies are themselves declared as code,
  reconciled by the platform.
