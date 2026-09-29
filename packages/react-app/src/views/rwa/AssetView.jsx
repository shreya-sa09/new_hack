import React, { useState } from "react";
import { Card, Tag, Button, Space, Descriptions, List, Typography, message, Tooltip } from "antd";
import { STATUS, STATUS_COLOR, ASSET_CLASS, formatINR, docTypeLabel, shortAddr } from "./shared";
import { decryptPassport, decryptDocument } from "./docFlows";
import { pinata } from "../../helpers";

const { Text } = Typography;

function StatusTag({ asset }) {
  return (
    <Space size={4}>
      <Tag color={STATUS_COLOR[asset.status]}>{STATUS[asset.status]}</Tag>
      {asset.hasActiveLien && <Tag color="volcano">LIEN</Tag>}
      {asset.onHold && <Tag color="red">ON HOLD</Tag>}
    </Space>
  );
}

/**
 * Presentational asset card with decrypt actions.
 * Props: asset, myKeypair, myRole, extra (action buttons node).
 */
export default function AssetView({ asset, myKeypair, myRole, extra }) {
  const [passport, setPassport] = useState(null);
  const [busy, setBusy] = useState(false);

  const canDecrypt = Boolean(myKeypair);

  const viewPassport = async () => {
    setBusy(true);
    try {
      const p = await decryptPassport(asset.metadataCID, myKeypair, myRole);
      setPassport(p);
      message.success("Passport decrypted");
    } catch (e) {
      message.error(e.message || "Could not decrypt passport (no key access?)");
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = async doc => {
    setBusy(true);
    try {
      const { bytes, hashOk } = await decryptDocument(doc, myKeypair, myRole);
      if (!hashOk) message.warning("Ciphertext hash mismatch — file may be tampered.");
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `asset-${asset.id}-${docTypeLabel(doc.docType)}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Decrypted ${docTypeLabel(doc.docType)}${hashOk ? " (hash verified)" : ""}`);
    } catch (e) {
      message.error(e.message || "Could not decrypt document (no key access?)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, textAlign: "left" }}
      title={
        <Space>
          <Text strong>Asset #{asset.id}</Text>
          <Tag>{ASSET_CLASS[asset.assetClass]}</Tag>
          <StatusTag asset={asset} />
        </Space>
      }
      extra={extra}
    >
      <Descriptions size="small" column={1} labelStyle={{ width: 130 }}>
        <Descriptions.Item label="Owner">{shortAddr(asset.owner)}</Descriptions.Item>
        <Descriptions.Item label="Submitter">{shortAddr(asset.submitter)}</Descriptions.Item>
        {asset.lien.active && (
          <Descriptions.Item label="Lien (payoff)">
            {formatINR(asset.lien.amount)} → {shortAddr(asset.lien.lender)}
          </Descriptions.Item>
        )}
        {asset.attestation.verifier !== "0x0000000000000000000000000000000000000000" && (
          <Descriptions.Item label="Attestation">
            {asset.attestation.approved ? "✅ approved" : "❌ rejected"} by {shortAddr(asset.attestation.verifier)}
            {asset.attestation.findingsCID && (
              <>
                {" · "}
                <a href={pinata.gatewayUrl(asset.attestation.findingsCID)} target="_blank" rel="noreferrer">
                  findings
                </a>
              </>
            )}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Passport CID">
          <Tooltip title={asset.metadataCID}>
            <a href={pinata.gatewayUrl(asset.metadataCID)} target="_blank" rel="noreferrer">
              {asset.metadataCID ? asset.metadataCID.slice(0, 14) + "…" : "-"}
            </a>
          </Tooltip>{" "}
          <Text type="secondary" style={{ fontSize: 11 }}>
            (ciphertext)
          </Text>
        </Descriptions.Item>
      </Descriptions>

      <Space style={{ marginTop: 8, marginBottom: 8 }}>
        <Button size="small" onClick={viewPassport} loading={busy} disabled={!canDecrypt || !asset.metadataCID}>
          🔓 Decrypt passport
        </Button>
      </Space>

      {passport && (
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 8 }} labelStyle={{ width: 130 }}>
          {Object.entries(passport).map(([k, v]) => (
            <Descriptions.Item key={k} label={k}>
              {String(v)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}

      <List
        size="small"
        header={<Text strong>Documents ({asset.docs.length})</Text>}
        dataSource={asset.docs}
        locale={{ emptyText: "No documents" }}
        renderItem={doc => (
          <List.Item
            actions={[
              <Button size="small" key="dl" onClick={() => downloadDoc(doc)} disabled={!canDecrypt} loading={busy}>
                🔓 decrypt
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={docTypeLabel(doc.docType)}
              description={
                <Text type="secondary" style={{ fontSize: 11 }}>
                  sha256 {doc.sha256Hash.slice(0, 12)}… · cid {doc.cid.slice(0, 12)}…
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
