import React, { useMemo } from "react";
import { ArrowRightOutlined, EnvironmentOutlined, SafetyCertificateOutlined, WalletOutlined } from "@ant-design/icons";
import { formatINR } from "./shared";
import { demoInfoFor } from "./demoCatalog";

export default function BuyerDashboard({ assets = [], address, tinrBalance, onNavigate }) {
  const verified = useMemo(() => assets.filter(asset => asset.status === 3 && !asset.onHold), [assets]);
  const owned = useMemo(() => assets.filter(asset => asset.owner && address && asset.owner.toLowerCase() === address.toLowerCase()), [assets, address]);
  const featured = verified.slice(0, 3);
  const value = tinrBalance ? formatINR(tinrBalance) : "₹0";

  return (
    <div className="by-wrap">
      <section className="by-welcome">
        <div><span className="by-kicker">BUYER WORKSPACE</span><h2>Your portfolio, with asset details in view.</h2><p>Explore active listings and track ownership on the DRUNIX network.</p></div>
        <div className="by-balance"><span><WalletOutlined /> Settlement balance</span><strong>{value} <small>tINR</small></strong><em>Local demo funds</em></div>
      </section>
      <section className="by-metrics">
        <article><span className="by-metric-icon blue"><SafetyCertificateOutlined /></span><small>Available listings</small><strong>{verified.length}</strong><em>Verified and active</em></article>
        <article><span className="by-metric-icon green"><WalletOutlined /></span><small>Assets in your wallet</small><strong>{owned.length}</strong><em>Recorded on-chain</em></article>
        <article><span className="by-metric-icon violet">◇</span><small>Network</small><strong>DRUNIX</strong><em>Permissioned demo chain</em></article>
      </section>
      <section className="by-listings">
        <div className="by-list-head"><div><span className="by-kicker">DISCOVER</span><h3>Available opportunities</h3></div><button onClick={() => onNavigate("market")}>Open marketplace <ArrowRightOutlined /></button></div>
        {featured.length ? <div className="by-card-grid">{featured.map(asset => {
          const info = demoInfoFor(asset.metadataCID);
          return <article className="by-card" key={asset.id}>
            <div className="by-photo" style={info && info.image ? { backgroundImage: `url(${info.image})` } : undefined}><span>Verified asset</span></div>
            <div className="by-card-body"><strong>{info ? info.title : `Property asset #${asset.id}`}</strong><span className="by-location"><EnvironmentOutlined /> {info ? info.location : "Property passport"}</span>
              <div className="by-card-stats"><div><small>Unit price</small><b>{info ? info.tokenPrice : "₹500"}</b></div><div><small>Target yield</small><b>{info ? info.yield : "—"}</b></div></div>
              <button onClick={() => onNavigate("market")}>View listing <ArrowRightOutlined /></button>
            </div>
          </article>;
        })}</div> : <div className="by-empty">No verified listings are available right now.</div>}
      </section>
      <style>{`
        .by-wrap { display:flex; flex-direction:column; gap:18px; }
        .by-welcome { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:23px 25px; border:1px solid #e5ebf3; border-radius:16px; background:linear-gradient(105deg,#edf4ff,#fff 72%); }
        .by-kicker { color:#2868f5; font-size:9px; font-weight:800; letter-spacing:.14em; }.by-welcome h2 { margin:7px 0 4px; color:#202734; font-size:20px; letter-spacing:-.03em; }.by-welcome p { margin:0; color:#7d8998; font-size:11px; }
        .by-balance { min-width:180px; padding:13px 15px; border:1px solid #e5eaf0; border-radius:12px; background:#fff; }.by-balance span { display:block; color:#7d8998; font-size:10px; }.by-balance span .anticon { margin-right:5px; color:#2868f5; }.by-balance strong { display:block; margin-top:4px; color:#202734; font-size:20px; }.by-balance small { color:#8490a0; font-size:10px; }.by-balance em { display:block; color:#9aa3b0; font-size:9px; font-style:normal; }
        .by-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }.by-metrics article { display:grid; grid-template-columns:36px 1fr; grid-template-rows:auto auto auto; column-gap:10px; align-items:center; min-height:94px; padding:14px 16px; border:1px solid #e9edf2; border-radius:13px; background:#fff; box-shadow:0 5px 18px rgba(34,48,70,.03); }.by-metric-icon { grid-row:1/4; width:34px; height:34px; display:grid; place-items:center; border-radius:10px; }.by-metric-icon.blue { color:#2868f5; background:#edf3ff; }.by-metric-icon.green { color:#1d9b61; background:#eaf7f0; }.by-metric-icon.violet { color:#7055d9; background:#f1edff; font-size:21px; }.by-metrics small { color:#8792a1; font-size:10px; }.by-metrics strong { color:#202734; font-size:19px; line-height:1.2; }.by-metrics em { color:#9aa3b0; font-size:9px; font-style:normal; }
        .by-listings { padding:19px; border:1px solid #e9edf2; border-radius:14px; background:#fff; }.by-list-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:14px; }.by-list-head h3 { margin:4px 0 0; color:#202734; font-size:16px; }.by-list-head button { border:0; background:transparent; color:#2868f5; font-size:10px; font-weight:700; cursor:pointer; }.by-list-head button .anticon { margin-left:5px; }
        .by-card-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; }.by-card { overflow:hidden; border:1px solid #e9edf2; border-radius:12px; background:#fff; }.by-photo { height:120px; position:relative; background:#eaf0f6 center/cover; }.by-photo span { position:absolute; top:9px; left:9px; padding:5px 8px; border-radius:6px; background:rgba(255,255,255,.92); color:#168553; font-size:9px; font-weight:700; }.by-card-body { padding:12px; }.by-card-body > strong { display:block; color:#303a49; font-size:11px; }.by-location { display:block; margin-top:5px; color:#8b96a4; font-size:9px; }.by-location .anticon { color:#299b63; }.by-card-stats { display:flex; justify-content:space-between; margin:12px 0; padding:9px 0; border-top:1px solid #eef1f4; border-bottom:1px solid #eef1f4; }.by-card-stats div { display:flex; flex-direction:column; gap:4px; }.by-card-stats small { color:#8b96a4; font-size:9px; }.by-card-stats b { color:#273342; font-size:12px; }.by-card-body > button { width:100%; padding:8px; border:1px solid #dbe5f6; border-radius:8px; background:#f4f7ff; color:#2868f5; font-size:10px; font-weight:700; cursor:pointer; }.by-card-body > button .anticon { margin-left:5px; }
        .by-empty { padding:34px; border:1px dashed #dbe2ea; border-radius:12px; color:#8a94a2; text-align:center; font-size:11px; }
        @media(max-width:900px) { .by-card-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media(max-width:600px) { .by-welcome { align-items:flex-start; flex-direction:column; padding:18px; }.by-balance { width:100%; box-sizing:border-box; }.by-metrics { grid-template-columns:1fr; }.by-card-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}