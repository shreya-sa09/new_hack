import React, { useMemo } from "react";
import { AppstoreOutlined, SafetyCertificateOutlined, ClockCircleOutlined, BankOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { STATUS } from "./shared";
import { demoInfoFor } from "./demoCatalog";

const STATUS_NAMES = ["Draft", "In review", "Verified", "Active"];

export default function Overview({ assets = [], loading, onNavigate }) {
  const counts = useMemo(() => STATUS.map((_, index) => assets.filter(asset => asset.status === index).length), [assets]);
  const maxCount = Math.max(1, ...counts);
  const recent = useMemo(() => [...assets].sort((a, b) => b.id - a.id).slice(0, 5), [assets]);
  const verifiedCount = counts[2] + counts[3];
  const activeLiens = assets.filter(asset => asset.hasActiveLien).length;
  const stats = [
    { label: "Registered assets", value: assets.length, Icon: AppstoreOutlined, tone: "blue", note: "Across all review stages" },
    { label: "Verified passports", value: verifiedCount, Icon: SafetyCertificateOutlined, tone: "green", note: "Attested by an authorized verifier" },
    { label: "Awaiting review", value: counts[1], Icon: ClockCircleOutlined, tone: "amber", note: "In the verification queue" },
    { label: "Active liens", value: activeLiens, Icon: BankOutlined, tone: "violet", note: "Recorded against an asset" },
  ];

  return (
    <div className="ov">
      <section className="ov-banner">
        <div className="ov-banner-mark"><SafetyCertificateOutlined /></div>
        <div className="ov-banner-copy">
          <span className="ov-eyebrow">DRUNIX NETWORK · LOCAL DEMO</span>
          <h2>Asset records, reviews and controls in one place.</h2>
          <p>Follow each asset from document review through token issuance and compliant transfer.</p>
        </div>
        <button className="ov-banner-action" onClick={() => onNavigate("market")}>Browse assets <ArrowRightOutlined /></button>
      </section>

      <section className="ov-stats" aria-label="Network summary">
        {stats.map(({ label, value, Icon, tone, note }) => (
          <article className="ov-stat" key={label}>
            <div className={`ov-stat-icon ${tone}`}><Icon /></div>
            <div className="ov-stat-label">{label}</div>
            <div className="ov-stat-value">{loading ? "—" : value.toLocaleString("en-IN")}</div>
            <div className="ov-stat-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="ov-panels">
        <article className="ov-panel ov-activity">
          <div className="ov-panel-head">
            <div><span className="ov-eyebrow">PORTFOLIO</span><h3>Recent asset activity</h3></div>
            <button className="ov-link" onClick={() => onNavigate("owner")}>Open dashboard <ArrowRightOutlined /></button>
          </div>
          {recent.length ? (
            <div className="ov-asset-list">
              {recent.map(asset => {
                const info = demoInfoFor(asset.metadataCID);
                const status = STATUS_NAMES[asset.status] || "Unknown";
                return (
                  <div className="ov-asset-row" key={asset.id}>
                    <div className="ov-asset-thumb" style={info && info.image ? { backgroundImage: `url(${info.image})` } : undefined}>
                      <AppstoreOutlined />
                    </div>
                    <div className="ov-asset-main">
                      <strong>{info ? info.title : `Property asset #${asset.id}`}</strong>
                      <span>{info ? info.location : "Property passport"} · Asset #{asset.id}</span>
                    </div>
                    <span className={`ov-status s${asset.status}`}>{status}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ov-empty">
              <div className="ov-empty-icon"><AppstoreOutlined /></div>
              <strong>Your asset activity will appear here</strong>
              <span>Register a property to begin its verification and tokenization journey.</span>
              <button onClick={() => onNavigate("owner")}>Register an asset <ArrowRightOutlined /></button>
            </div>
          )}
        </article>

        <article className="ov-panel ov-chart-panel">
          <div className="ov-panel-head">
            <div><span className="ov-eyebrow">VERIFICATION PIPELINE</span><h3>Assets by stage</h3></div>
            <span className="ov-chart-total">{assets.length} total</span>
          </div>
          <div className="ov-chart">
            {counts.map((count, index) => (
              <div className="ov-chart-col" key={STATUS_NAMES[index]}>
                <span className="ov-chart-count">{count}</span>
                <div className="ov-chart-track"><span className={`ov-chart-bar b${index}`} style={{ height: `${Math.max(8, (count / maxCount) * 136)}px` }} /></div>
                <span className="ov-chart-label">{STATUS_NAMES[index]}</span>
              </div>
            ))}
          </div>
          <div className="ov-chart-foot"><span><i className="ov-legend-dot" /> On-chain asset count</span><span>Updated live</span></div>
        </article>
      </section>
    </div>
  );
}