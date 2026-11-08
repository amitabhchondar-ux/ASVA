export function SetupHelp() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Setup Help</h1>
      <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-6">
        <h2 className="font-medium text-[#f4eee6] mb-3">Hub address</h2>
        <p className="text-[#b9b4ae] text-sm mb-4">
          The ASVA Hub is running on this computer. Open the website at:
        </p>
        <div className="bg-[#10131b] border border-[#2a2f3e] rounded-lg p-3 font-mono text-sm mb-4">
          http://localhost:8080
        </div>
        <p className="text-[#b9b4ae] text-sm mb-4">
          For devices to connect, they need this computer&apos;s local IP address (e.g.
          <span className="text-[#f4eee6] font-mono">192.168.1.50</span>) and port 1883 for MQTT.
        </p>

        <h2 className="font-medium text-[#f4eee6] mb-3">MQTT details</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-[#2a2f3e]">
              <tr>
                <td className="px-3 py-2 text-[#b9b4ae]">Broker URL</td>
                <td className="px-3 py-2 text-[#f4eee6] font-mono">mqtt://&lt;hub-ip&gt;:1883</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[#b9b4ae]">Username</td>
                <td className="px-3 py-2 text-[#f4eee6] font-mono">hub</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[#b9b4ae]">Password</td>
                <td className="px-3 py-2 text-[#f4eee6] font-mono">(set in .env)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[#b9b4ae]">Topic prefix</td>
                <td className="px-3 py-2 text-[#f4eee6] font-mono">asva/&lt;deviceId&gt;/</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="font-medium text-[#f4eee6] mb-3">Device connection checklist</h2>
        <ol className="list-decimal list-inside text-[#b9b4ae] text-sm leading-relaxed space-y-2 mb-4">
          <li>Flash the ASVA firmware to your ESP32 board.</li>
          <li>Set Wi-Fi SSID, password, and hub IP in menuconfig.</li>
          <li>Set MQTT username and password to match the hub.</li>
          <li>Set a unique device ID.</li>
          <li>Power on the device &mdash; it should appear as Online on the dashboard.</li>
          <li>Say &ldquo;Hello ASVA&rdquo; &mdash; the wake word event should appear in the live feed.</li>
        </ol>

        <h2 className="font-medium text-[#f4eee6] mb-3">Simulator (no hardware)</h2>
        <p className="text-[#b9b4ae] text-sm mb-4">
          To develop without hardware, run the simulator:
        </p>
        <div className="bg-[#10131b] border border-[#2a2f3e] rounded-lg p-3 font-mono text-sm mb-4">
          cd hub/simulator<br />
          npm run simulate -- --broker mqtt://localhost:1883 --id asva-sim-01
        </div>
        <p className="text-[#b9b4ae] text-sm">
          Use keys <span className="text-[#f4eee6] font-mono">w</span> (wake), <span className="text-[#f4eee6] font-mono">1</span> (Light on),
          <span className="text-[#f4eee6] font-mono">0</span> (Light off), <span className="text-[#f4eee6] font-mono">s</span> (Status).
        </p>
      </div>
    </div>
  );
}
