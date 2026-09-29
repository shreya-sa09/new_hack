import React, { useState } from "react";
import { Card, Button, Space, Alert, Typography, message, Timeline } from "antd";
import AssetView from "./AssetView";
import { shortAddr } from "./shared";

const { Text } = Typography;
const ZERO = "0x0000000000000000000000000000000000000000";

export default function RegulatorAudit({ assets, registry, registryWrite, rwaTx, myKeypair, roles, refresh }) {
  const [history, setHistory] = useState({}); // assetId -> [{from,to,block}]
  const [busy, setBusy] = useState(false);

  const setHold = async (id, on) => {
    setBusy(true);
    try {
      await rwaTx(on ? registryWrite.placeHold(id) : registryWrite.liftHold(id));
      message.success(`Asset #${id} ${on ? "placed on hold" : "hold lifted"}`);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed (need REGULATOR_ROLE)");
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async id => {
    try {
      const events = await registry.queryFilter(registry.filters.Transfer(null, null, id));
      setHistory(prev => ({
        ...prev,
        [id]: events.map(e => ({ from: e.args.from, to: e.args.to, block: e.blockNumber })),
      }));
    } catch (e) {
      message.error(e.message || "Could not load history");
    }
  };

  return (
    <div style={{ textAlign: "left" }}>
      {!roles.regulator && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Audit view"
          description="Switch to the “Regulator” identity to place or lift dispute holds. Read access is open to all."
        />
      )}
      <Card size="small" title={`All assets (${assets.length}) — audit`}>
        {assets.length === 0 && <Text type="secondary">No assets registered.</Text>}
        {assets.map(asset => (
          <div key={asset.id}>
            <AssetView
              asset={asset}
              myKeypair={myKeypair}
              myRole="regulator"
              extra={
                <Space>
                  <Button size="small" onClick={() => loadHistory(asset.id)}>
                    Provenance
                  </Button>
                  {asset.onHold ? (
                    <Button size="small" disabled={!roles.regulator} onClick={() => setHold(asset.id, false)} loading={busy}>
                      Lift hold
                    </Button>
                  ) : (
                    <Button size="small" danger disabled={!roles.regulator} onClick={() => setHold(asset.id, true)} loading={busy}>
                      Place hold
                    </Button>
                  )}
                </Space>
              }
            />
            {history[asset.id] && (
              <Card size="small" style={{ marginBottom: 12, background: "rgba(0,0,0,0.02)" }}>
                <Text strong>Chain of custody</Text>
                <Timeline style={{ marginTop: 12 }}>
                  {history[asset.id].map((h, i) => (
                    <Timeline.Item key={i}>
                      {h.from === ZERO ? "🏭 Minted to " : `${shortAddr(h.from)} → `}
                      {shortAddr(h.to)} <Text type="secondary">(block {h.block})</Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Card>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
