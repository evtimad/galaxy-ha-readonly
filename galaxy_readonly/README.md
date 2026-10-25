# Galaxy 3-144 Read-only Gateway

A passive, read-only Home Assistant App for a Galaxy 3-144 V5.00 installation with an E080-08A Ethernet module.

The app never sends commands to the panel. It listens for event messages that the E080 has been explicitly configured to deliver to the Home Assistant Green IP address and selected port.

## Before installation

- Give Home Assistant Green a fixed DHCP lease.
- Keep the panel, E080 and Home Assistant on a protected LAN/VLAN.
- Do not expose the listener or E080 to the public internet.
- Back up the E080 configuration before changing reporting destinations.
- Keep the existing alarm receiving centre path unchanged.

## E080 requirement

An authorised Galaxy installer must configure an additional, non-primary event destination toward the Home Assistant Green address. The exact E080 channel, transport, encryption and event format depend on the installed module configuration and licensed documentation. This app does not guess or alter those settings.

## Installation

1. Put this repository in a Git repository reachable by Home Assistant, or copy the `galaxy_readonly` folder into a valid local App repository.
2. In Home Assistant open **Settings > Apps > App store > Repositories**.
3. Add the repository URL.
4. Install **Galaxy 3-144 Read-only Gateway**.
5. Configure protocol and port to match the installer-configured E080 destination.
6. Start the app and open its Web UI.

## Options

- `listen_protocol`: `udp` or `tcp`.
- `listen_port`: local event receiver port.
- `allowed_sender`: optional E080 IP address. Leave empty only during commissioning.
- `event_format`: `auto`, `sia_text`, or `raw`.
- `log_raw_messages`: troubleshooting only. Raw messages can contain account or site identifiers.

## Read-only guarantee

The application only creates listening sockets. It does not connect to the E080, transmit acknowledgements, arm, disarm, reset, program, or emulate a keypad. TCP clients receive no application data from this app.
