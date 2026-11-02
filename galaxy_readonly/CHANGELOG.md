# Changelog
## 0.7.2
- Includes all 0.7.1 changes.
- Device 15 is the virtual keypad (panel log shows KEY 15). Device names are added on first start if missing; existing names are kept.
## 0.7.1
- Field `pi` shown as "Zone" only for zone events. For set/unset and remote calls it is the device address (10 keypad, 15 virtual keypad, 4 Ethernet module).
- Device names editable in the Web UI.
- User name taken from the event text (e.g. "UNSET Evtim" -> Evtim; "MGR." -> Мениджър).
- New attributes: device, device_name, user_name.
## 0.7.0
- Zone and group names, editable in the Web UI.
## 0.6.0
- Zone alarm sensors, persistence, auto-clear.
## 0.5.0
- Payload decoding, group sensors.
## 0.4.x
- Receiver, ACK, CRC per length, HA token fix.
