import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Dropdown, Menu, Button, Alert, Input, message } from "antd";
import {
  AppstoreOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  BarChartOutlined,
  SettingOutlined,
  SearchOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BellOutlined,
  DownOutlined,
  WalletOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Transactor, rwaCrypto } from "../../helpers";
import { IDENTITIES, walletFor, addressFor } from "./identities";
import { useRwaAssets, useMyRoles, formatINR, shortAddr } from "./shared";
import OwnerAssets from "./OwnerAssets";
import VerifierQueue from "./VerifierQueue";
import RegulatorAudit from "./RegulatorAudit";
import Marketplace from "./Marketplace";
import Overview from "./Overview";
import LoginScreen from "./LoginScreen";
import BuyerDashboard from "./BuyerDashboard";

const SECTIONS = [
  {
    key: "overview",
    Icon: BarChartOutlined,
    label: "Overview",
    title: "Network Overview",
    subtitle: "A live view of asset verification and transaction activity",
    Component: Overview,
  },
  {
    key: "market",
    Icon: ShopOutlined,
    label: "Marketplace",
    title: "Asset Marketplace",
    subtitle: "Invest in tokenized real-world assets",
    Component: Marketplace,
  },
  {
    key: "owner",
    Icon: AppstoreOutlined,
    label: "Dashboard",
    title: "Owner Dashboard",
    subtitle: "Register properties, encrypt documents, and submit assets for verification",
    Component: OwnerAssets,
  },
  {
    key: "verifier",
    Icon: SafetyCertificateOutlined,
    label: "Verifier",
    title: "Verifier Queue",
    subtitle: "Review submitted assets, inspect documents, and attest on-chain",
    Component: VerifierQueue,
  },
  {
    key: "regulator",
    Icon: AuditOutlined,
    label: "Regulator",
    title: "Regulator Audit",
    subtitle: "Audit the full document trail and place or lift holds on any asset",
    Component: RegulatorAudit,
  },
];

const BUYER_SECTIONS = [
  { key: "buyer-dashboard", Icon: BarChartOutlined, label: "Dashboard", title: "Buyer Dashboard", subtitle: "Your portfolio and verified investment opportunities", Component: BuyerDashboard },
  { key: "market", Icon: ShopOutlined, label: "Marketplace", title: "Asset Marketplace", subtitle: "Explore verified real-world assets", Component: Marketplace },
];

/**
 * RWA tokenization dashboard, presented as a full-page marketplace app.
 * An in-browser identity switcher over deterministic local Hardhat accounts
 * lets one browser play every role (owner / verifier / regulator / bank / buyer).
 */
export default function RwaApp({ readContracts, localProvider, gasPrice }) {
  const [workspace, setWorkspace] = useState(() => sessionStorage.getItem("drunix_demo_workspace"));
  const [identityIndex, setIdentityIndex] = useState(() => sessionStorage.getItem("drunix_demo_workspace") === "buyer" ? 5 : 1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [onChainKey, setOnChainKey] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [activeKey, setActiveKey] = useState("overview");
  const [query, setQuery] = useState("");

  const enterWorkspace = mode => {
    sessionStorage.setItem("drunix_demo_workspace", mode);
    setWorkspace(mode);
    setIdentityIndex(mode === "buyer" ? 5 : 1);
    setActiveKey(mode === "buyer" ? "buyer-dashboard" : "overview");
  };
  const signOut = () => {
    sessionStorage.removeItem("drunix_demo_workspace");
    setWorkspace(null);
    setActiveKey("overview");
  };

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const identity = IDENTITIES[identityIndex];
  const address = useMemo(() => addressFor(identityIndex), [identityIndex]);
  const wallet = useMemo(
    () => (localProvider ? walletFor(identityIndex, localProvider) : null),
    [identityIndex, localProvider],
  );

  const registry = readContracts && readContracts.RWAAssetRegistry;
  const registryWrite = useMemo(() => (registry && wallet ? registry.connect(wallet) : null), [registry, wallet]);
  const tinr = readContracts && readContracts.TokenizedINR;
  const tinrWrite = useMemo(() => (tinr && wallet ? tinr.connect(wallet) : null), [tinr, wallet]);
  const rwaTx = useMemo(() => (wallet ? Transactor(wallet, gasPrice) : null), [wallet, gasPrice]);

  const { assets, loading, error } = useRwaAssets(readContracts, refreshKey);
  const roles = useMyRoles(readContracts, address, refreshKey);

  const myKeypair = useMemo(() => {
    try {
      rwaCrypto.initCrypto();
      return rwaCrypto.getOrCreateKeypair(address);
    } catch (_) {
      return null;
    }
  }, [address, refreshKey]);

  const [tinrBalance, setTinrBalance] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await rwaCrypto.initCrypto();
      if (registry && address) {
        try {
          const k = await registry.publicKeys(address);
          if (!cancelled) setOnChainKey(k);
        } catch (_) {
          /* ignore */
        }
      }
      if (tinr && address) {
        try {
          const b = await tinr.balanceOf(address);
          if (!cancelled) setTinrBalance(b);
        } catch (_) {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registry, tinr, address, refreshKey]);

  const localPkHex = useMemo(() => {
    try {
      return rwaCrypto.publicKeyHex(address);
    } catch (_) {
      return null;
    }
  }, [address, myKeypair]);

  const keyRegistered = onChainKey && onChainKey !== "0x" && onChainKey === localPkHex;

  const registerKey = async () => {
    if (!rwaTx || !registryWrite) return;
    setRegistering(true);
    try {
      await rwaTx(registryWrite.registerPublicKey(localPkHex));
      message.success("Encryption key registered on-chain");
      refresh();
    } catch (e) {
      message.error(e.message || "Failed to register key");
    } finally {
      setRegistering(false);
    }
  };

  const shared = {
    assets,
    loading,
    refresh,
    identity,
    identityIndex,
    address,
    wallet,
    registry,
    registryWrite,
    tinr,
    tinrWrite,
    rwaTx,
    myKeypair,
    roles,
    query,
    tinrBalance,
  };

  const sections = workspace === "buyer" ? BUYER_SECTIONS : SECTIONS;
  const section = sections.find(s => s.key === activeKey) || sections[0];
  const ActiveView = section.Component;
  const initials = identity.role.slice(0, 2).toUpperCase();

  const identityMenu = (
    <Menu
      className="db-menu"
      selectedKeys={[String(identityIndex)]}
      onClick={({ key }) => setIdentityIndex(Number(key))}
      items={(workspace === "buyer" ? IDENTITIES.filter(i => i.index === 5) : IDENTITIES.filter(i => i.index !== 0 && i.index !== 5)).map(i => ({ key: String(i.index), label: `${i.label} · ${i.desc}` }))}
    />
  );

  if (!workspace) return <><DbStyles /><LoginScreen onChoose={enterWorkspace} /></>;

  return (
    <div className="db">
      <DbStyles />

      {/* ─────────────── Sidebar ─────────────── */}
      <aside className="db-sidebar">
        <div className="db-brand">
          <span className="db-brand-mark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 22 12 12 22 2 12z" fill="#fff" opacity="0.95" />
            </svg>
          </span>
          <span className="db-brand-word">DRUNIX</span>
        </div>

        <nav className="db-nav">
          {sections.map(s => (
            <button
              key={s.key}
              type="button"
              className={`db-nav-item${s.key === activeKey ? " active" : ""}`}
              onClick={() => setActiveKey(s.key)}
            >
              <s.Icon className="db-nav-icon" />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="db-sidebar-foot">
          <div className="db-keycard">
            <div className="db-keycard-row">
              <WalletOutlined />
              <span className="db-keycard-bal">{tinrBalance != null ? `${formatINR(tinrBalance)} tINR` : "— tINR"}</span>
            </div>
            {keyRegistered ? (
              <div className="db-keycard-ok"><span className="db-dot" /> Encryption key ready</div>
            ) : (
              <Button size="small" className="db-key-btn" block loading={registering} onClick={registerKey} disabled={!registry}>
                Register key
              </Button>
            )}
          </div>
          <button className="db-nav-item db-settings" onClick={signOut}>
            <SettingOutlined className="db-nav-icon" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ─────────────── Main ─────────────── */}
      <div className="db-main">
        {/* Top bar */}
        <header className="db-topbar">
          <div className="db-greeting">
            <strong>Welcome, {identity.label}</strong>
            <span>Asset and verification overview</span>
          </div>          <div className="db-search">
            <SearchOutlined />
            <input
              placeholder="Search assets, cities or tokens…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="db-topbar-right">
            <button className="db-tb-btn" onClick={() => message.info("Demo — tINR is pre-funded to the Buyer identity.")}>
              <ArrowDownOutlined /> Deposit
            </button>
            <button className="db-tb-btn" onClick={() => message.info("Demo — withdrawals are disabled on the local prototype.")}>
              <ArrowUpOutlined /> Withdraw
            </button>
            <button className="db-icon-btn" title="Notifications">
              <BellOutlined />
              <span className="db-badge">2</span>
            </button>
            <button className="db-signout-top" onClick={signOut} aria-label="Sign out">
              <LogoutOutlined /> <span>Sign out</span>
            </button>
            <Dropdown overlay={identityMenu} trigger={["click"]} placement="bottomRight">
              <button className="db-profile">
                <span className="db-avatar">{initials}</span>
                <span className="db-profile-text">
                  <span className="db-profile-name">{identity.label}</span>
                  <span className="db-profile-sub">{shortAddr(address)}</span>
                </span>
                <DownOutlined className="db-profile-caret" />
              </button>
            </Dropdown>
          </div>
        </header>

        {/* Content */}
        <div className="db-content">
          <div className="db-head">
            <div>
              <h1 className="db-title">{section.title}</h1>
              <p className="db-subtitle">{section.subtitle}</p>
            </div>
            <div className="db-head-tags">
              {roles.admin && <span className="db-role">Admin</span>}
              {roles.verifier && <span className="db-role">Verifier</span>}
              {roles.regulator && <span className="db-role">Regulator</span>}
            </div>
          </div>

          {!registry ? (
            <div className="db-empty">
              <div className="db-empty-title">Contracts not found on this network</div>
              <div className="db-empty-text">
                Start a local chain and deploy, then reload: <code>yarn chain</code> → <code>yarn deploy</code>.
              </div>
            </div>
          ) : (
            <>
              {error && (
                <Alert type="error" showIcon message="Failed to load assets" description={error} style={{ marginBottom: 16 }} />
              )}
              <ActiveView {...shared} onNavigate={setActiveKey} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scoped dark dashboard theme + antd overrides. Kept inline so the view is self-contained. */
function DbStyles() {
  return (
    <style>{`
      .db {
        --ac: #2868f5;
        --ac-2: #4b83ff;
        --bg: #f3f5f8;
        --sidebar: #ffffff;
        --panel: #ffffff;
        --panel-2: #f7f8fa;
        --border: #e5e9ef;
        --text: #202734;
        --muted: #778295;
        --ok: #20a56a;
        display: flex;
        min-height: calc(100vh - 8px);
        margin: 4px;
        border-radius: 20px;
        overflow: hidden;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--text);
        text-align: left;
      }

      .db { font-family: Inter, "Segoe UI", Arial, sans-serif; }
      .db-greeting { flex: 0 0 auto; min-width: 175px; display: flex; flex-direction: column; gap: 4px; }
      .db-greeting strong { color: #293444; font-size: 14px; font-weight: 650; }
      .db-greeting span { color: #8a94a2; font-size: 10px; }
      .db-topbar { background: #fff; min-height: 72px; }
      .db-sidebar { box-shadow: 5px 0 18px rgba(30,46,70,.025); }
      .db-content { background: #f6f8fb; }
      .db-nav-item.active { border-radius: 10px; }
      @media (max-width: 900px) { .db-greeting { display: none; } }
      /* Sidebar */
      .db-sidebar { width: 232px; flex-shrink: 0; background: var(--sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; }
      .db-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 22px; }
      .db-brand-mark { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, var(--ac), #175ae4); display: flex; align-items: center; justify-content: center; }
      .db-brand-word { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
      .db-nav { display: flex; flex-direction: column; gap: 3px; }
      .db-nav-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: none; background: transparent; border-radius: 10px; font-size: 14px; font-weight: 500; color: var(--muted); cursor: pointer; text-align: left; transition: all 0.14s ease; }
      .db-nav-item:hover { background: rgba(33,48,72,0.05); color: var(--text); }
      .db-nav-item.active { background: var(--ac); color: #fff; box-shadow: 0 6px 18px rgba(40,104,245,0.35); }
      .db-nav-icon { font-size: 16px; }
      .db-sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
      .db-keycard { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
      .db-keycard-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); margin-bottom: 10px; }
      .db-keycard-bal { color: var(--ac-2); font-weight: 700; }
      .db-keycard-ok { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); }
      .db-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 8px var(--ok); }
      .db .db-key-btn { background: var(--ac); border-color: var(--ac); color: #fff; font-weight: 600; border-radius: 8px; }
      .db .db-key-btn:hover { background: var(--ac-2); border-color: var(--ac-2); color: #fff; }
      .db-settings { margin-top: 2px; }

      /* Main */
      .db-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .db-topbar { display: flex; align-items: center; gap: 16px; padding: 14px 24px; border-bottom: 1px solid var(--border); }
      .db-search { flex: 1; max-width: 420px; display: flex; align-items: center; gap: 9px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 9px 13px; color: var(--muted); }
      .db-search input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 13.5px; }
      .db-search input::placeholder { color: #9aa3b0; }
      .db-topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
      .db-signout-top { display: inline-flex; align-items: center; gap: 7px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
      .db-signout-top:hover { color: var(--ac); border-color: var(--ac); }
      .db-tb-btn { display: inline-flex; align-items: center; gap: 7px; background: var(--panel); border: 1px solid var(--border); color: var(--text); font-size: 13px; font-weight: 500; padding: 9px 14px; border-radius: 10px; cursor: pointer; transition: all 0.14s ease; }
      .db-tb-btn:hover { border-color: var(--ac); }
      .db-icon-btn { position: relative; width: 38px; height: 38px; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); color: var(--text); cursor: pointer; }
      .db-icon-btn:hover { border-color: var(--ac); }
      .db-badge { position: absolute; top: -5px; right: -5px; background: var(--ac); color: #fff; font-size: 10px; font-weight: 700; min-width: 17px; height: 17px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; }
      .db-profile { display: inline-flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 6px 12px 6px 6px; cursor: pointer; }
      .db-profile:hover { border-color: var(--ac); }
      .db-avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--ac), #175ae4); color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
      .db-profile-text { display: flex; flex-direction: column; line-height: 1.15; }
      .db-profile-name { font-size: 13px; font-weight: 600; color: var(--text); }
      .db-profile-sub { font-size: 11px; color: var(--muted); font-family: ui-monospace, Menlo, monospace; }
      .db-profile-caret { font-size: 10px; color: var(--muted); }

      /* Content */
      .db-content { padding: 24px 28px 44px; overflow-y: auto; }
      .db-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
      .db-title { font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
      .db-subtitle { color: var(--muted); font-size: 14px; margin: 6px 0 0; }
      .db-head-tags { display: flex; gap: 8px; }
      .db-role { background: rgba(40,104,245,0.16); color: var(--ac-2); font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; }

      .db-empty { border: 1px dashed var(--border); border-radius: 16px; padding: 48px; text-align: center; }
      .db-empty-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
      .db-empty-text { color: var(--muted); font-size: 13.5px; }
      .db-empty-text code { background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; padding: 1px 7px; color: var(--ac-2); margin: 0 2px; }

      /* Overview dashboard */
      .ov { display: flex; flex-direction: column; gap: 20px; }
      .ov-banner { display: flex; align-items: center; gap: 18px; padding: 22px 24px; background: linear-gradient(105deg,#edf4ff,#f7f9fc 68%,#edf7f1); border: 1px solid #e5ebf4; border-radius: 17px; }
      .ov-banner-mark { flex: 0 0 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; color: #2868f5; background: #fff; box-shadow: 0 4px 16px rgba(32,55,90,.08); font-size: 20px; }
      .ov-banner-copy { min-width: 0; }
      .ov-eyebrow { display: block; color: #7b8798; font-size: 10px; font-weight: 700; letter-spacing: .13em; }
      .ov-banner h2 { margin: 5px 0 3px; color: #202734; font-size: 18px; font-weight: 700; letter-spacing: -.02em; }
      .ov-banner p { margin: 0; color: #778295; font-size: 12.5px; }
      .ov-banner-action { margin-left: auto; flex-shrink: 0; display: inline-flex; align-items: center; gap: 9px; padding: 10px 15px; border: 0; border-radius: 9px; background: #2868f5; color: white; font-weight: 600; font-size: 12px; cursor: pointer; box-shadow: 0 5px 12px rgba(40,104,245,.18); }
      .ov-banner-action:hover { background: #175ae4; }
      .ov-stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; }
      .ov-stat,.ov-panel { background: #fff; border: 1px solid #e9edf2; border-radius: 14px; box-shadow: 0 5px 18px rgba(34,48,70,.035); }
      .ov-stat { min-height: 148px; padding: 17px 18px; position: relative; }
      .ov-stat-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; font-size: 15px; margin-bottom: 12px; }
      .ov-stat-icon.blue { color: #2868f5; background: #edf3ff; }
      .ov-stat-icon.green { color: #1d9b61; background: #eaf7f0; }
      .ov-stat-icon.amber { color: #c78a22; background: #fff5e5; }
      .ov-stat-icon.violet { color: #7055d9; background: #f1edff; }
      .ov-stat-label { color: #778295; font-size: 11.5px; }
      .ov-stat-value { margin-top: 3px; color: #202734; font-size: 25px; line-height: 1.15; font-weight: 700; letter-spacing: -.03em; }
      .ov-stat-note { margin-top: 5px; color: #9aa3b0; font-size: 10.5px; }
      .ov-panels { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(300px,.8fr); gap: 16px; align-items: stretch; }
      .ov-panel { padding: 19px 20px; min-height: 300px; }
      .ov-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
      .ov-panel-head h3 { margin: 4px 0 0; color: #202734; font-size: 15px; font-weight: 700; }
      .ov-link { border: 0; background: transparent; color: #2868f5; font-size: 11px; font-weight: 600; cursor: pointer; }
      .ov-link .anticon { margin-left: 5px; font-size: 10px; }
      .ov-asset-list { display: flex; flex-direction: column; }
      .ov-asset-row { min-height: 55px; display: flex; align-items: center; gap: 12px; border-top: 1px solid #f0f2f5; }
      .ov-asset-thumb { flex: 0 0 40px; width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; color: #2868f5; background-color: #edf3ff; background-size: cover; background-position: center; overflow: hidden; }
      .ov-asset-thumb .anticon { filter: drop-shadow(0 1px 2px rgba(0,0,0,.12)); }
      .ov-asset-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
      .ov-asset-main strong { color: #303a49; font-size: 11.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ov-asset-main span { color: #9099a7; font-size: 10px; }
      .ov-status { flex-shrink: 0; padding: 4px 8px; border-radius: 99px; font-size: 9.5px; font-weight: 600; background: #f1f3f6; color: #6f7b8a; }
      .ov-status.s1 { background: #fff5e5; color: #b47b1c; }
      .ov-status.s2,.ov-status.s3 { background: #eaf7f0; color: #168553; }
      .ov-chart-total { padding: 5px 9px; border-radius: 7px; background: #f4f6f9; color: #778295; font-size: 10px; }
      .ov-chart { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; height: 192px; padding: 12px 2px 0; border-bottom: 1px solid #edf0f4; }
      .ov-chart-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
      .ov-chart-count { color: #475365; font-size: 11px; font-weight: 700; }
      .ov-chart-track { height: 140px; width: min(40px,70%); display: flex; align-items: flex-end; justify-content: center; border-radius: 9px 9px 3px 3px; background: #f1f4f8; overflow: hidden; }
      .ov-chart-bar { display: block; width: 100%; max-height: 136px; border-radius: 8px 8px 0 0; background: #c8d9ff; transition: height .25s ease; }
      .ov-chart-bar.b1 { background: #6d9aff; }.ov-chart-bar.b2 { background: #83cda7; }.ov-chart-bar.b3 { background: #2868f5; }
      .ov-chart-label { width: 100%; text-align: center; color: #8c96a5; font-size: 9px; white-space: nowrap; }
      .ov-chart-foot { display: flex; justify-content: space-between; color: #9aa3b0; font-size: 9.5px; padding-top: 12px; }
      .ov-chart-foot > span:first-child { display: flex; align-items: center; gap: 6px; }
      .ov-legend-dot { width: 7px; height: 7px; display: inline-block; border-radius: 50%; background: #2868f5; }
      .ov-empty { min-height: 215px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-top: 1px solid #f0f2f5; text-align: center; }
      .ov-empty-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; color: #2868f5; background: #edf3ff; font-size: 18px; }
      .ov-empty strong { color: #303a49; font-size: 12px; }
      .ov-empty span { max-width: 290px; color: #9099a7; font-size: 10.5px; }
      .ov-empty button { margin-top: 4px; border: 0; background: transparent; color: #2868f5; font-size: 11px; font-weight: 600; cursor: pointer; }
      .ov-empty button .anticon { margin-left: 5px; }

      /* Featured marketplace panel */
      .mk-featured { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(310px,.82fr); overflow: hidden; margin: 16px 0 28px; border: 1px solid var(--border); border-radius: 18px; background: var(--panel); box-shadow: 0 10px 28px rgba(34,48,70,.055); }
      .mk-featured-photo { position: relative; min-height: 360px; background-color: #e9eff5; background-position: center; background-size: cover; }
      .mk-featured-category { position: absolute; top: 16px; left: 16px; padding: 6px 10px; border-radius: 7px; background: rgba(255,255,255,.9); color: #384557; font-size: 10px; font-weight: 700; }
      .mk-photo-caption { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; padding: 30px 18px 14px; color: #fff; font-size: 10px; font-weight: 600; background: linear-gradient(transparent,rgba(12,22,18,.74)); }
      .mk-photo-live { display: inline-flex; align-items: center; gap: 7px; }.mk-photo-live i { width: 7px; height: 7px; border-radius: 50%; background: #7de2a7; }
      .mk-featured-panel { display: flex; flex-direction: column; padding: 24px 25px 20px; }
      .mk-featured-eyebrow { color: #218656; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
      .mk-verified-mark { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-right: 3px; border-radius: 50%; background: #eaf7f0; }
      .mk-featured-panel h2 { margin: 11px 0 4px; color: #202734; font-size: 22px; line-height: 1.25; letter-spacing: -.03em; }
      .mk-featured-location { color: #798494; font-size: 11px; }.mk-featured-location .anticon { margin-right: 4px; color: #299b63; }
      .mk-featured-copy { margin: 14px 0 17px; color: #788495; font-size: 11px; line-height: 1.6; }
      .mk-featured-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 13px 0; border-top: 1px solid #edf0f3; border-bottom: 1px solid #edf0f3; }
      .mk-featured-stats div,.mk-featured-invest div { display: flex; flex-direction: column; gap: 5px; }.mk-featured-stats span,.mk-featured-invest span { color: #8a94a2; font-size: 10px; }.mk-featured-stats strong,.mk-featured-invest strong { color: #202734; font-size: 16px; }
      .mk-featured-green { color: #229760 !important; }.mk-featured-progress { margin-top: 14px; }.mk-featured-progress > div:first-child { display: flex; justify-content: space-between; color: #7e8998; font-size: 10px; }.mk-featured-progress strong { color: #2b3645; }
      .mk-featured-track { height: 6px; margin-top: 7px; border-radius: 99px; background: #edf1f4; overflow: hidden; }.mk-featured-track span { display: block; height: 100%; border-radius: 99px; background: #299b63; }
      .mk-featured-invest { display: flex; align-items: center; justify-content: space-between; margin: 15px 0; padding: 12px; border-radius: 10px; background: #f6f8fa; }
      .mk-featured-cta { display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%; padding: 12px; }.mk-featured-foot { margin-top: 9px; text-align: center; color: #9aa3b0; font-size: 9px; }
      .mk-listing-heading { display: flex; align-items: flex-end; justify-content: space-between; margin: 0 0 14px; }.mk-listing-heading span { color: #8a94a2; font-size: 10px; }.mk-listing-heading h2 { margin: 3px 0 0; color: #202734; font-size: 17px; }
      .mk-photo-icon { position: absolute; right: 12px; bottom: 46px; display: grid; place-items: center; width: 29px; height: 29px; border-radius: 9px; color: #fff; background: rgba(255,255,255,.2); backdrop-filter: blur(6px); }

      @media (max-width: 1050px) {
        .ov-stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
        .ov-panels { grid-template-columns: 1fr; }
        .mk-featured { grid-template-columns: 1fr 0.9fr; }
      }
      @media (max-width: 700px) {
        .ov-banner { align-items: flex-start; flex-wrap: wrap; padding: 17px; }
        .ov-banner-action { margin-left: 66px; }
        .ov-stats { gap: 9px; }
        .ov-stat { min-height: 136px; padding: 13px; }
        .ov-stat-value { font-size: 21px; }
        .ov-panels { display: flex; flex-direction: column; }
        .mk-featured { grid-template-columns: 1fr; }
        .mk-featured-photo { min-height: 240px; }
        .mk-featured-panel { padding: 20px; }
      }
      /* dropdown menu (portalled) */
      .db-menu.ant-dropdown-menu { background: #ffffff; border: 1px solid #e5e9ef; border-radius: 12px; padding: 6px; }
      .db-menu .ant-dropdown-menu-item { color: #202734; border-radius: 8px; padding: 8px 12px; }
      .db-menu .ant-dropdown-menu-item:hover { background: rgba(40,104,245,0.16); }
      .db-menu .ant-dropdown-menu-item-selected { background: rgba(40,104,245,0.28); color: #fff; }

      /* ── AntD dark overrides scoped to the dashboard ── */
      .db .ant-card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; color: var(--text); }
      .db .ant-card-head { color: var(--text); border-bottom-color: var(--border); min-height: 46px; }
      .db .ant-card-head-title { font-weight: 600; }
      .db .ant-card-small > .ant-card-body { padding: 16px; }
      .db .ant-typography { color: var(--text); }
      .db .ant-typography.ant-typography-secondary { color: var(--muted); }
      .db .ant-form-item-label > label { color: var(--muted); }
      .db h1,.db h2,.db h3,.db h4,.db h5 { color: var(--text); }
      .db .ant-input, .db .ant-input-number, .db .ant-input-affix-wrapper, .db .ant-input-number-input,
      .db .ant-picker, .db .ant-select:not(.ant-select-customize-input) .ant-select-selector {
        background: var(--panel-2); border-color: var(--border); color: var(--text); border-radius: 8px;
      }
      .db .ant-input::placeholder, .db .ant-input-number-input::placeholder { color: #9aa3b0; }
      .db .ant-select-arrow, .db .ant-select-selection-item { color: var(--text); }
      .db .ant-input:hover, .db .ant-input-number:hover, .db .ant-select:not(.ant-select-disabled):hover .ant-select-selector { border-color: var(--ac); }
      .db .ant-input:focus, .db .ant-input-focused, .db .ant-input-number-focused { border-color: var(--ac); box-shadow: 0 0 0 2px rgba(40,104,245,0.2); }
      .db .ant-btn { background: var(--panel-2); border-color: var(--border); color: var(--text); border-radius: 8px; }
      .db .ant-btn:hover { border-color: var(--ac); color: #fff; }
      .db .ant-btn-primary { background: var(--ac); border-color: var(--ac); color: #fff; }
      .db .ant-btn-primary:hover { background: var(--ac-2); border-color: var(--ac-2); }
      .db .ant-btn-primary.ant-btn-background-ghost { background: transparent; color: var(--ac-2); }
      .db .ant-btn-link { color: var(--ac-2); background: transparent; border: none; }
      .db .ant-tag { border-radius: 6px; border: none; }
      .db .ant-divider { border-color: var(--border); color: var(--muted); }
      .db .ant-divider-inner-text { color: var(--muted); font-size: 12px; }
      .db .ant-steps-item-title { color: var(--muted) !important; }
      .db .ant-steps-item-process .ant-steps-item-icon { background: var(--ac); border-color: var(--ac); }
      .db .ant-steps-item-finish .ant-steps-item-icon { background: transparent; border-color: var(--ac); }
      .db .ant-steps-item-finish .ant-steps-icon { color: var(--ac-2); }
      .db .ant-alert { border-radius: 10px; border: 1px solid var(--border); }
      .db .ant-alert-info { background: rgba(40,104,245,0.1); border-color: rgba(40,104,245,0.3); }
      .db .ant-alert-info .ant-alert-message, .db .ant-alert-info .ant-alert-description { color: var(--text); }
      .db .ant-alert-warning { background: rgba(214,163,64,0.1); border-color: rgba(214,163,64,0.35); }
      .db .ant-alert-warning .ant-alert-message, .db .ant-alert-warning .ant-alert-description { color: #e7c583; }
      .db .ant-select-dropdown { background: var(--panel-2); border: 1px solid var(--border); }
      .db .ant-select-item { color: var(--text); }
      .db .ant-select-item-option-active:not(.ant-select-item-option-disabled) { background: rgba(40,104,245,0.16); }
      .db .ant-select-item-option-selected:not(.ant-select-item-option-disabled) { background: rgba(40,104,245,0.24); color: #fff; }

      @media (max-width: 900px) {
        .db { flex-direction: column; }
        .db-sidebar { width: auto; flex-direction: row; flex-wrap: wrap; align-items: center; }
        .db-nav { flex-direction: row; flex-wrap: wrap; }
        .db-sidebar-foot { margin: 0 0 0 auto; flex-direction: row; }
        .db-keycard { display: none; }
        .db-profile-text { display: none; }
        .db-tb-btn span { display: none; }
      }
      @media (max-width: 900px) {
        .db { flex-direction: column; margin: 8px; min-height: calc(100vh - 16px); }
        .db-sidebar { display: grid; grid-template-columns: auto minmax(0,1fr); width: auto; gap: 10px 16px; align-items: center; padding: 12px 14px; }
        .db-brand { padding: 0; white-space: nowrap; }
        .db-nav { min-width: 0; display: flex; flex-direction: row; flex-wrap: nowrap; gap: 4px; overflow-x: auto; }
        .db-nav-item { width: auto; flex: 0 0 auto; padding: 9px 10px; white-space: nowrap; font-size: 12px; }
        .db-sidebar-foot { display: none; }
        .db-content { padding: 20px 18px 30px; }
      }
      @media (max-width: 560px) {
        .db-sidebar { grid-template-columns: 1fr; gap: 10px; }
        .db-nav-item { font-size: 11px; padding: 8px; }
        .db-topbar { gap: 8px; padding: 10px 12px; }
        .db-topbar-right { gap: 4px; }
        .db-signout-top { padding: 8px; font-size: 11px; }
        .db-tb-btn { padding: 8px 9px; }
        .db-profile { padding-right: 7px; }
        .db-content { padding: 16px 12px 24px; }
      }
    `}</style>
  );
}
