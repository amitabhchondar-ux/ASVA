export function Privacy() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Privacy</h1>
      <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-6">
        <h2 className="font-medium text-[#f4eee6] mb-3">What ASVA stores</h2>
        <p className="text-[#b9b4ae] text-sm leading-relaxed mb-4">
          ASVA processes all speech on the device itself. The firmware sends only small event
          messages over MQTT — never raw audio. The hub stores event metadata only:
        </p>
        <ul className="list-disc list-inside text-[#b9b4ae] text-sm leading-relaxed mb-4 space-y-2">
          <li>Which wake word or command was recognized</li>
          <li>Confidence score and latency for each detection</li>
          <li>Timestamp and device ID</li>
          <li>LED state and telemetry (memory, Wi-Fi signal, uptime)</li>
          <li>User account email and role (hashed password)</li>
        </ul>
        <h2 className="font-medium text-[#f4eee6] mb-3">What ASVA never stores</h2>
        <ul className="list-disc list-inside text-[#b9b4ae] text-sm leading-relaxed mb-4 space-y-2">
          <li>Raw audio samples or recordings</li>
          <li>Transcripts of speech</li>
          <li>Voice prints or biometric data</li>
          <li>Anything that leaves your local network</li>
        </ul>
        <h2 className="font-medium text-[#f4eee6] mb-3">Network</h2>
        <p className="text-[#b9b4ae] text-sm leading-relaxed mb-4">
          Everything runs on your local network. The hub, broker, and website are all local.
          No data is sent to the cloud or any external service.
        </p>
        <div className="pt-4 border-t border-[#2a2f3e] text-xs text-[#6b6a66]">
          Verified by network capture: all device traffic is MQTT under 1 KB per message,
          containing no audio payloads.
        </div>
      </div>
    </div>
  );
}
