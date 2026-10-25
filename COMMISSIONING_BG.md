# Commissioning v0.2.0

Диагностична read-only версия за Galaxy 3-144 V5.00 / E080-08A.

Препоръчителни App настройки за теста:
```yaml
listen_protocol: udp
listen_port: 1002
allowed_sender: "192.168.1.155"
event_format: raw
retain_events: 100
log_raw_messages: true
```
Приложението не изпраща команди или application ACK към E080.
