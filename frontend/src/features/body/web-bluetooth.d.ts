/**
 * The few parts of Web Bluetooth the scale needs. TypeScript's DOM library doesn't have the API
 * (Chrome and Edge only); these follow https://webbluetoothcg.github.io/web-bluetooth/.
 */

interface BluetoothLEScanFilter {
  services?: number[]
  namePrefix?: string
}

interface RequestDeviceOptions {
  filters: BluetoothLEScanFilter[]
  optionalServices?: number[]
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value?: DataView
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: number): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: number): Promise<BluetoothRemoteGATTService>
}

interface BluetoothDevice extends EventTarget {
  readonly gatt?: BluetoothRemoteGATTServer
}

interface Bluetooth {
  getAvailability(): Promise<boolean>
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>
}

interface Navigator {
  readonly bluetooth?: Bluetooth
}
