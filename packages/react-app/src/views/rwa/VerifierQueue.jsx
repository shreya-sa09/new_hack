import React, { useState } from "react";
import { Card, Button, Space, Alert, Typography, message, Tag, List } from "antd";
import AssetView from "./AssetView";
import { decryptPassport } from "./docFlows";
import { runFindings, pinata } from "../../helpers";

const { Text } = Typography;

function FindingsPanel({ findings }) {
  if (!findings) return null;
  return (
    <Card size="small" style={{ marginBottom: 8, background: "rgba(0,0,0,0.02)" }}>
      <Space direction="vertical" size={2} style={{ width: "100%" }}>
        <Text strong>
          AI findings — score {findings.score}/100{" "}
          <Tag color={findings.verdict === "LIKELY_OK" ? "green" : "orange"}>{findings.verdict}</Tag>
        </Text>
        <List
          size="small"
          dataSource={findings.checks}
          renderItem={c => (
            <List.Item style={{ padding: "2px 0" }}>
              <Text>
                {c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌"} {c.name} — {c.note}
              </Text>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}

export default function VerifierQueue({ assets, registryWrite, rwaTx, myKeypair, roles, refresh }) {
  const [findings, setFindings] = useState({}); // assetId -> findings
  const [findingsCID, setFindingsCID] = useState({}); // assetId -> cid
  const [busy, setBusy] = useState(false);

  const queue = assets.filter(a => a.status === 1); // UNDER_REVIEW

  const analyze = async asset => {
    setBusy(true);
    try {
      let passport = {};
      try {
        passport = await decryptPassport(asset.metadataCID, myKeypair, "verifier");
      } catch (_) {
        message.warning("Could not decrypt passport for analysis; running on metadata only.");
      }
      const f = runFindings(passport, asset.docs);
      const cid = await pinata.pinJSON(f, `findings-asset-${asset.id}.json`);
      setFindings(prev => ({ ...prev, [asset.id]: f }));
      setFindingsCID(prev => ({ ...prev, [asset.id]: cid }));
      message.success("Findings generated and pinned");
    } catch (e) {
      message.error(e.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (asset, approved) => {
    setBusy(true);
    try {
      await rwaTx(registryWrite.verify(asset.id, approved, findingsCID[asset.id] || ""));
      message.success(`Asset #${asset.id} ${approved ? "verified" : "rejected"}`);
      refresh();
    } catch (e) {
      message.error(e.message || "Verify failed (need VERIFIER_ROLE)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ textAlign: "left" }}>
      {!roles.verifier && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="You are not a verifier"
          description="Switch the identity to “Verifier (Govt)” to endorse assets. You can still review here."
        />
      )}
      <Card size="small" title={`Review queue (${queue.length})`}>
        {queue.length === 0 && <Text type="secondary">Nothing awaiting review.</Text>}
        {queue.map(asset => (
          <div key={asset.id}>
            <AssetView
              asset={asset}
              myKeypair={myKeypair}
              myRole="verifier"
              extra={
                <Space>
                  <Button size="small" onClick={() => analyze(asset)} loading={busy}>
                    🤖 Run AI findings
                  </Button>
                  <Button size="small" type="primary" disabled={!roles.verifier} onClick={() => decide(asset, true)} loading={busy}>
                    Approve → VERIFIED
                  </Button>
                  <Button size="small" danger disabled={!roles.verifier} onClick={() => decide(asset, false)} loading={busy}>
                    Reject
                  </Button>
                </Space>
              }
            />
            <FindingsPanel findings={findings[asset.id]} />
          </div>
        ))}
      </Card>
    </div>
  );
}
