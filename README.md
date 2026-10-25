# Galaxy 3-144 Read-only Home Assistant App

Private experimental Home Assistant App repository for a **Galaxy 3-144 V5.00** panel with **E080-08A** Ethernet module.

## Safety model

- Read-only event receiver.
- No arm, disarm, reset, keypad emulation, programming, or panel control.
- Does not actively connect to the E080.
- Listens only for an additional event stream configured by an authorised installer.
- The existing alarm receiving centre path must remain unchanged.

## Repository layout

```text
.
├── repository.yaml
├── galaxy_readonly/
│   ├── config.yaml
│   ├── build.yaml
│   ├── Dockerfile
│   ├── README.md
│   ├── CHANGELOG.md
│   ├── translations/
│   └── rootfs/
├── .github/workflows/validate.yml
├── .gitignore
└── LICENSE
```

## Publish to GitHub

Create an empty private repository named `galaxy-ha-readonly`. Do not initialise it with a README because this package already contains one.

From a terminal opened inside this folder:

```bash
git init
git add .
git commit -m "Initial Galaxy read-only Home Assistant App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/galaxy-ha-readonly.git
git push -u origin main
```

Replace `YOUR_USERNAME` with the GitHub account name.

## Important private-repository limitation

Home Assistant's custom App repository screen normally consumes a repository URL directly. A private repository may require an authenticated or mirrored delivery method, depending on the Home Assistant/Supervisor version and repository provider. For the simplest first installation, use a public repository containing code only and keep every site-specific value in Home Assistant App options. If the repository remains private, use a deployment method that your Home Assistant installation can authenticate to, or maintain a local App repository.

Never commit:

- Galaxy user or installer codes;
- E080 passwords, keys, or certificates;
- public IP addresses;
- panel exports;
- packet captures;
- alarm receiving centre credentials.

## Home Assistant installation

See [`INSTALL.md`](INSTALL.md). Home Assistant Green uses the `aarch64` build.

## Validation

A lightweight GitHub Actions workflow checks JavaScript syntax and required App files after every push.
