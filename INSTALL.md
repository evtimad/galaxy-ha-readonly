# Local installation notes

Home Assistant Apps are normally installed from a Git repository URL. Publish this folder to a private Git repository, then add that repository URL in Home Assistant under Settings > Apps > App store > Repositories.

For Home Assistant Green use the `aarch64` build declared in `build.yaml`.

Commissioning order:

1. Install and start with `allowed_sender` empty.
2. Send one installer-approved test event from E080.
3. Confirm the sender IP in the dashboard/log.
4. Set `allowed_sender` to the fixed E080 IP.
5. Disable `log_raw_messages` after commissioning.
6. Confirm the existing alarm-receiving path still operates normally.
