# WebSocket Connection Test - TODO List

## Overview

Test websocket connection between ESP32-S3 (ShotStopper) and Next.js app to report brewing data in real-time.

## Tasks

### Next.js App Setup

- [X] **Task 1**: Create Next.js app with websocket support for ESP connection testing
- [X] **Task 2**: Set up Next.js project structure (package.json, dependencies, basic pages)
- [X] **Task 3**: Create websocket server/client components in Next.js app
  - [X] Setup and configure shadcn/ui in the Next.js app
- [X] **Task 4**: Create UI components to display received ESP data in Next.js (using shadcn/ui components)

### ESP/Arduino Modifications

- [X] **Task 5**: Modify ShotStopper.ino to add WiFi and WebSocket client support
- [X] **Task 6**: Implement data reporting in ShotStopper (weight, shot timer, brewing state, etc.)
- [X] **Task 7**: Configure ESP32-S3 WiFi credentials and WebSocket server address

### Testing

- [X] **Task 8**: Test websocket connection between ESP and Next.js app

---

## Notes

- Current ShotStopper.ino location: `ArduinoCode/ShotStopper.ino`
- ESP32-S3 board used
- Data to report: current weight, shot timer, brewing state, goal weight, shot trajectory data
