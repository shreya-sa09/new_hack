import React from "react";
import { SafetyCertificateOutlined, WalletOutlined, FileSearchOutlined, ArrowRightOutlined, LockOutlined } from "@ant-design/icons";

export default function LoginScreen({ onChoose }) {
  return (
    <main className="db-login">
      <div className="db-login-brand"><span className="db-login-mark">◆</span><strong>DRUNIX</strong><span>REAL-WORLD ASSET NETWORK</span></div>
      <section className="db-login-shell">
        <div className="db-login-intro">
          <span className="db-login-kicker">COMPLIANCE-FIRST TOKENIZATION</span>
          <h1>Real assets.<br />Clearer ownership.</h1>
          <p>Explore verified opportunities or manage an asset through review, attestation, and issuance.</p>
          <div className="db-login-flow"><span><i>01</i> Verify</span><b /> <span><i>02</i> Tokenize</span><b /> <span><i>03</i> Transact</span></div>
        </div>
        <div className="db-login-select">
          <span className="db-login-kicker">LOCAL DEMO ACCESS</span>
          <h2>Choose your workspace</h2>
          <p>Select a role to enter the prototype.</p>
          <button className="db-login-option buyer" onClick={() => onChoose("buyer")}>
            <span className="db-login-option-icon"><WalletOutlined /></span>
            <span className="db-login-option-copy"><strong>Buyer workspace</strong><small>Explore assets and view your token portfolio.</small></span>
            <ArrowRightOutlined className="db-login-arrow" />
          </button>
          <button className="db-login-option operations" onClick={() => onChoose("operations")}>
            <span className="db-login-option-icon"><FileSearchOutlined /></span>
            <span className="db-login-option-copy"><strong>Asset operations</strong><small>Register properties, review documents, and attest assets.</small></span>
            <ArrowRightOutlined className="db-login-arrow" />
          </button>
          <div className="db-login-note"><LockOutlined /> Demo role selection only. Production sign-in and access control are not connected.</div>
        </div>
      </section>
      <div className="db-login-footer"><SafetyCertificateOutlined /> Assets move through documented review and on-chain controls.</div>
      <style>{`
        .db-login { min-height:100vh; padding:34px 28px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box; background:radial-gradient(ellipse at 12% 10%,#e5efff 0,transparent 35%),radial-gradient(ellipse at 88% 90%,#e7f5ed 0,transparent 33%),#f4f6fa; color:#202734; font-family:Inter,"Segoe UI",Arial,sans-serif; }
        .db-login-brand { width:min(100%,1040px); display:flex; align-items:center; gap:10px; margin-bottom:18px; color:#202734; }
        .db-login-mark { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:#2868f5; color:#fff; font-size:14px; }
        .db-login-brand strong { font-size:17px; letter-spacing:-.02em; }.db-login-brand > span:last-child { margin-left:7px; color:#8a94a2; font-size:9px; font-weight:700; letter-spacing:.12em; }
        .db-login-shell { width:min(100%,1040px); display:grid; grid-template-columns:1fr 1fr; overflow:hidden; border:1px solid #e4e9f0; border-radius:20px; background:#fff; box-shadow:0 24px 65px rgba(37,57,86,.11); }
        .db-login-intro { display:flex; flex-direction:column; justify-content:center; padding:52px 48px; background:linear-gradient(145deg,#edf4ff,#f7f9fc 65%,#edf7f1); }
        .db-login-kicker { color:#2868f5; font-size:9px; font-weight:800; letter-spacing:.14em; }
        .db-login-intro h1 { margin:15px 0 12px; color:#1d2735; font-size:39px; line-height:1.08; letter-spacing:-.05em; }
        .db-login-intro p { max-width:380px; margin:0; color:#718094; font-size:13px; line-height:1.7; }
        .db-login-flow { display:flex; align-items:center; gap:10px; margin-top:34px; color:#48576a; font-size:10px; font-weight:700; }
        .db-login-flow i { display:inline-grid; place-items:center; width:22px; height:22px; margin-right:5px; border-radius:7px; background:#fff; color:#2868f5; font-style:normal; }
        .db-login-flow b { width:18px; height:1px; background:#d8e1ed; }
        .db-login-select { padding:42px 38px 30px; }
        .db-login-select h2 { margin:9px 0 4px; color:#202734; font-size:23px; letter-spacing:-.03em; }
        .db-login-select > p { margin:0 0 22px; color:#8792a1; font-size:12px; }
        .db-login-option { width:100%; display:flex; align-items:center; gap:13px; margin:0 0 12px; padding:15px; text-align:left; border:1px solid #e7ebf1; border-radius:13px; background:#fff; cursor:pointer; transition:.16s ease; }
        .db-login-option:hover { border-color:#8fb1ff; transform:translateY(-1px); box-shadow:0 9px 22px rgba(40,104,245,.09); }
        .db-login-option-icon { display:grid; place-items:center; flex:0 0 40px; width:40px; height:40px; border-radius:11px; color:#2868f5; background:#edf3ff; font-size:17px; }
        .db-login-option.operations .db-login-option-icon { color:#188553; background:#eaf7f0; }
        .db-login-option-copy { flex:1; display:flex; flex-direction:column; gap:4px; }.db-login-option-copy strong { color:#283445; font-size:12px; }.db-login-option-copy small { color:#8792a1; font-size:10px; line-height:1.4; }
        .db-login-arrow { color:#8e9aab; font-size:12px; }.db-login-note { display:flex; align-items:flex-start; gap:7px; margin-top:16px; color:#8d98a6; font-size:9px; line-height:1.5; }.db-login-note .anticon { margin-top:1px; }
        .db-login-footer { width:min(100%,1040px); margin-top:16px; display:flex; align-items:center; gap:8px; color:#8792a1; font-size:10px; }.db-login-footer .anticon { color:#269a61; }
        @media(max-width:760px) { .db-login { padding:22px 14px; }.db-login-shell { grid-template-columns:1fr; }.db-login-intro { padding:30px 26px; }.db-login-intro h1 { font-size:32px; }.db-login-flow { margin-top:20px; }.db-login-select { padding:28px 22px 22px; } }
      `}</style>
    </main>
  );
}