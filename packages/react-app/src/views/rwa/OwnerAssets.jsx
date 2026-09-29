import React, { useState } from "react";
import { Card, Form, Input, InputNumber, Button, Select, Space, Upload, Alert, Typography, message, Divider, Steps } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { DOC_TYPES, isMe } from "./shared";
import { addressFor, VERIFIER_INDEX, REGULATOR_INDEX } from "./identities";
import { resolveRecipients, encryptAndPinDocument, encryptAndPinPassport } from "./docFlows";
import { rwaCrypto, pinata } from "../../helpers";
import AssetView from "./AssetView";

const { Text } = Typography;
const PROPERTY = 0;

export default function OwnerAssets({ assets, address, registry, registryWrite, rwaTx, myKeypair, identity, refresh }) {
  const [form] = Form.useForm();
  const [files, setFiles] = useState([]); // [{ docType, file }]
  const [pendingType, setPendingType] = useState(0);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);

  const myAssets = assets.filter(a => isMe(a.submitter, address));
  const pinataReady = pinata.isConfigured();

  const addFile = file => {
    setFiles(f => [...f, { docType: pendingType, file }]);
    return false; // prevent auto-upload
  };

  const createAsset = async values => {
    if (!pinataReady) {
      message.error("Set REACT_APP_PINATA_JWT in packages/react-app/.env first.");
      return;
    }
    if (files.length === 0) {
      message.error("Attach at least one document.");
      return;
    }
    setBusy(true);
    try {
      await rwaCrypto.initCrypto();
      // recipients: this owner + the verifier + the regulator
      const recips = [
        { role: "owner", address },
        { role: "verifier", address: addressFor(VERIFIER_INDEX) },
        { role: "regulator", address: addressFor(REGULATOR_INDEX) },
      ];
      const { resolved, missing } = await resolveRecipients(registry, recips);
      if (missing.length) {
        message.error(`These roles must register a key first: ${missing.join(", ")}. Switch to each and click "Register key on-chain".`);
        setBusy(false);
        return;
      }

      const passport = {
        assetClass: "PROPERTY",
        owner: values.ownerName,
        address: values.address,
        city: values.city,
        surveyNo: values.surveyNo,
        area: values.area ? `${values.area} sq.ft` : "",
        guidanceValue: values.guidanceValue ? String(values.guidanceValue) : "",
        createdBy: address,
        createdAt: new Date().toISOString(),
      };

      setStep(0); // encrypt + pin passport
      const { metadataCID, metadataHash } = await encryptAndPinPassport(passport, resolved);

      setStep(1); // create on-chain
      await rwaTx(registryWrite.createAsset(PROPERTY, metadataHash, metadataCID));
      const assetId = await registry.totalAssets();

      setStep(2); // encrypt + pin + attach each document
      for (const { docType, file } of files) {
        const bytes = await rwaCrypto.fileToBytes(file);
        const doc = await encryptAndPinDocument(bytes, resolved, `${file.name}`);
        await rwaTx(registryWrite.addDocument(assetId, docType, doc.sha256Hash, doc.cid, doc.keyBundleCID));
      }

      setStep(3); // submit for review
      await rwaTx(registryWrite.submitForReview(assetId));

      message.success(`Asset #${assetId} created, documents pinned, submitted for review.`);
      form.resetFields();
      setFiles([]);
      setStep(-1);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed to create asset");
      setStep(-1);
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async id => {
    try {
      await rwaTx(registryWrite.submitForReview(id));
      message.success(`Asset #${id} submitted for review`);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed");
    }
  };

  const mint = async id => {
    try {
      await rwaTx(registryWrite.mint(id));
      message.success(`Asset #${id} tokenized`);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed to mint (must be VERIFIED)");
    }
  };

  return (
    <div style={{ textAlign: "left" }}>
      {!pinataReady && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Pinata not configured"
          description="Add REACT_APP_PINATA_JWT to packages/react-app/.env and restart to enable document pinning."
        />
      )}

      <Card size="small" title="Create property asset" style={{ marginBottom: 20 }}>
        <Form form={form} layout="vertical" onFinish={createAsset} disabled={busy}>
          <Space wrap size="large" align="start">
            <Form.Item name="ownerName" label="Owner name" rules={[{ required: true }]}>
              <Input placeholder="Ramesh Kumar" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="address" label="Property address" rules={[{ required: true }]}>
              <Input placeholder="12/4, MG Road" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name="city" label="City">
              <Input placeholder="Bengaluru" style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space wrap size="large" align="start">
            <Form.Item name="surveyNo" label="Survey no.">
              <Input placeholder="45/2B" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="area" label="Area (sq.ft)">
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="guidanceValue" label="Guidance value (₹)">
              <InputNumber min={0} style={{ width: 180 }} />
            </Form.Item>
          </Space>

          <Divider style={{ margin: "8px 0" }}>Documents (encrypted client-side before pinning)</Divider>
          <Space wrap align="center" style={{ marginBottom: 8 }}>
            <Select
              value={pendingType}
              onChange={setPendingType}
              style={{ width: 200 }}
              options={DOC_TYPES.map((d, i) => ({ value: i, label: d }))}
            />
            <Upload beforeUpload={addFile} showUploadList={false} multiple={false}>
              <Button icon={<UploadOutlined />}>Attach file</Button>
            </Upload>
          </Space>
          {files.length > 0 && (
            <ul style={{ marginBottom: 12 }}>
              {files.map((f, i) => (
                <li key={i}>
                  <Text>
                    {DOC_TYPES[f.docType]} — {f.file.name}
                  </Text>{" "}
                  <Button type="link" size="small" danger onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {step >= 0 && (
            <Steps
              size="small"
              current={step}
              style={{ marginBottom: 16, maxWidth: 720 }}
              items={[
                { title: "Encrypt passport" },
                { title: "Create on-chain" },
                { title: "Pin documents" },
                { title: "Submit" },
              ]}
            />
          )}

          <Button type="primary" htmlType="submit" loading={busy} disabled={!pinataReady}>
            Create, encrypt & submit for review
          </Button>
        </Form>
      </Card>

      <Card size="small" title={`My assets (${myAssets.length})`}>
        {myAssets.length === 0 && <Text type="secondary">No assets yet.</Text>}
        {myAssets.map(asset => (
          <AssetView
            key={asset.id}
            asset={asset}
            myKeypair={myKeypair}
            myRole={identity.role.toLowerCase()}
            extra={
              <Space>
                {asset.status === 0 && asset.docs.length > 0 && (
                  <Button size="small" onClick={() => submitForReview(asset.id)}>
                    Submit for review
                  </Button>
                )}
                {asset.status === 2 && (
                  <Button size="small" type="primary" onClick={() => mint(asset.id)}>
                    Tokenize (mint)
                  </Button>
                )}
              </Space>
            }
          />
        ))}
      </Card>
    </div>
  );
}
