import React from 'react';
import DevicesBatteryHub from '@/components/device_sync/DevicesBatteryHub';

export default function DevicesPage() {
  return (
    <div className="p-10 animate-in">
      <h1 className="text-3xl font-black mb-8">Device Continuity</h1>
      <DevicesBatteryHub />
    </div>
  );
}
