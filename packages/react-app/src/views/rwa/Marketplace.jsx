import React, { useState, useMemo } from "react";
import { Button, InputNumber, message, Modal, Divider, Select, Dropdown, Menu } from "antd";
import {
  EnvironmentOutlined,
  RiseOutlined,
  HeartOutlined,
  FilterOutlined,
  HomeOutlined,
  ThunderboltOutlined,
  GoldOutlined,
  PictureOutlined,
  RocketOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { formatINR, parseINR, isMe, shortAddr } from "./shared";
import { demoInfoFor, CATEGORIES } from "./demoCatalog";
import { addressFor, BUYER_INDEX } from "./identities";

const CATEGORY_ICON = {
  "Real estate": HomeOutlined,
  Energy: ThunderboltOutlined,
  Commodities: GoldOutlined,
  Art: PictureOutlined,
  Startups: RocketOutlined,
  Bond: BankOutlined,
};

const RISK_CLASS = { Low: "low", Medium: "med", High: "high" };

export default function Marketplace({ assets, address, registry, registryWrite, tinrWrite, rwaTx, refresh, query }) {
  const [lienAmt, setLienAmt] = useState({});
  const [price, setPrice] = useState({});
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [risk, setRisk] = useState("All");
  const [manageId, setManageId] = useState(null);

  const active = useMemo(() => assets.filter(a => a.status === 3), [assets]);

  const decorate = a => {
    const info = demoInfoFor(a.metadataCID);
    return {
      ...a,
      info,
      title: info ? info.title : `Property Asset #${a.id}`,
      location: info ? info.location : "PROPERTY",
      category: info ? info.category : "Real estate",
      tokenPrice: info ? info.tokenPrice : "₹500",
      yieldPct: info ? info.yield : "12%",
      riskLevel: info ? info.risk : "Medium",
      minInvest: info ? info.minInvest : "₹5,000",
      funded: info ? info.funded : 50,
      image: info ? info.image : null,
      accent: info ? info.accent : "#299b63",
    };
  };

  const visible = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let list = active.map(decorate).filter(a => {
      if (category !== "All" && a.category !== category) return false;
      if (risk !== "All" && a.riskLevel !== risk) return false;
      if (!q) return true;
      return `${a.title} ${a.location} ${a.owner} ${a.id}`.toLowerCase().includes(q);
    });
    if (sort === "yield") list = list.sort((x, y) => parseFloat(y.yieldPct) - parseFloat(x.yieldPct));
    else if (sort === "funded") list = list.sort((x, y) => y.funded - x.funded);
    return list;
    // eslint-disable-next-line
  }, [active, category, risk, sort, query]);

  const counts = useMemo(() => {
    const c = { All: active.length };
    active.map(decorate).forEach(a => {
      c[a.category] = (c[a.category] || 0) + 1;
    });
    return c;
    // eslint-disable-next-line
  }, [active]);

  const manageAsset = useMemo(() => (manageId ? decorate(active.find(a => a.id === manageId)) : null), [manageId, active]);

  const registerLien = async id => {
    setBusy(true);
    try {
      await rwaTx(registryWrite.registerLien(id, parseINR(lienAmt[id] || 0)));
      message.success(`Lien registered on asset #${id}`);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const releaseLien = async id => {
    setBusy(true);
    try {
      await rwaTx(registryWrite.releaseLien(id));
      message.success(`Lien released on asset #${id}`);
      refresh();
    } catch (e) {
      message.error(e.message || "Failed (only the lender can release)");
    } finally {
      setBusy(false);
    }
  };

  const settle = async asset => {
    setBusy(true);
    try {
      const payoff = asset.lien.amount;
      const salePrice = price[asset.id] ? parseINR(price[asset.id]) : payoff;
      if (salePrice.lt(payoff)) {
        message.error("Sale price must cover the lender payoff.");
        setBusy(false);
        return;
      }
      await rwaTx(tinrWrite.approve(registry.address, salePrice));
      await rwaTx(registryWrite.settle(asset.id, address, salePrice));
      message.success(`Settled asset #${asset.id} atomically — lender paid, seller paid, lien released, ownership transferred.`);
      setManageId(null);
      refresh();
    } catch (e) {
      message.error(e.message || "Settlement reverted (insufficient tINR / on hold / price too low)");
    } finally {
      setBusy(false);
    }
  };

  const attemptDirectTransfer = async asset => {
    try {
      await rwaTx(registryWrite.transferFrom(address, addressFor(BUYER_INDEX), asset.id));
      message.warning("Transfer went through — expected it to be blocked!");
      refresh();
    } catch (e) {
      message.success("Blocked as expected: an encumbered/held asset cannot be transferred directly (E02/E03).");
    }
  };

  const sortMenu = (
    <Menu
      className="db-menu"
      selectedKeys={[sort]}
      onClick={({ key }) => setSort(key)}
      items={[
        { key: "featured", label: "Featured" },
        { key: "yield", label: "Highest yield" },
        { key: "funded", label: "Most funded" },
      ]}
    />
  );
  const filterMenu = (
    <Menu
      className="db-menu"
      selectedKeys={[risk]}
      onClick={({ key }) => setRisk(key)}
      items={["All", "Low", "Medium", "High"].map(r => ({ key: r, label: `${r} risk` }))}
    />
  );

  return (
    <div className="mk">
      <MkStyles />

      {/* toolbar: sort + filter (top-right of content) */}
      <div className="mk-toolbar">
        <Dropdown overlay={sortMenu} trigger={["click"]} placement="bottomRight">
          <button className="mk-tool">
            {sort === "featured" ? "Featured" : sort === "yield" ? "Highest yield" : "Most funded"} <span className="mk-caret">▾</span>
          </button>
        </Dropdown>
        <Dropdown overlay={filterMenu} trigger={["click"]} placement="bottomRight">
          <button className="mk-tool">
            <FilterOutlined /> Filter{risk !== "All" ? `: ${risk}` : ""}
          </button>
        </Dropdown>
      </div>

      {/* category tabs */}
      <div className="mk-tabs">
        {CATEGORIES.map(c => (
          <button key={c} className={`mk-tab${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
            {c}
            {counts[c] ? <span className="mk-tab-count">{counts[c]}</span> : null}
          </button>
        ))}
      </div>

      {visible.length > 0 && (() => {
        const featured = visible[0];
        const verified = featured.attestation && featured.attestation.approved;
        return (
          <section className="mk-featured">
            <div
              className="mk-featured-photo"
              role="img"
              aria-label={`Property photograph for ${featured.title}`}
              style={featured.image ? { backgroundImage: `linear-gradient(0deg, rgba(20,38,27,0.18), rgba(20,38,27,0.02)), url(${featured.image})` } : undefined}
            >
              <span className="mk-featured-category">{featured.category}</span>
              {featured.onHold && <span className="mk-hold">On hold</span>}
              <div className="mk-photo-caption">
                <span className="mk-photo-live"><i /> {verified ? "Verified on DRUNIX" : "Listed on DRUNIX"}</span>
                <span>Asset #{featured.id}</span>
              </div>
            </div>
            <div className="mk-featured-panel">
              <div className="mk-featured-eyebrow"><span className="mk-verified-mark">✓</span> {verified ? "Verified asset passport" : "Asset passport"}</div>
              <h2>{featured.title}</h2>
              <div className="mk-featured-location"><EnvironmentOutlined /> {featured.location}</div>
              <p className="mk-featured-copy">A fractional ownership opportunity with document review, asset status, and transfer history recorded on the network.</p>
              <div className="mk-featured-stats">
                <div><span>Indicative unit price</span><strong>{featured.tokenPrice}</strong></div>
                <div><span>Target annual yield</span><strong className="mk-featured-green">{featured.yieldPct}</strong></div>
              </div>
              <div className="mk-featured-progress">
                <div><span>Offering progress</span><strong>{featured.funded}%</strong></div>
                <div className="mk-featured-track"><span style={{ width: `${featured.funded}%` }} /></div>
              </div>
              <div className="mk-featured-invest">
                <div><span>Minimum allocation</span><strong>{featured.minInvest}</strong></div>
                <span className={`mk-risk ${RISK_CLASS[featured.riskLevel] || "med"}`}>{featured.riskLevel} risk</span>
              </div>
              <button className="mk-btn primary mk-featured-cta" onClick={() => setManageId(featured.id)}>Explore asset <span>→</span></button>
              <div className="mk-featured-foot">Transactions require identity and compliance checks.</div>
            </div>
          </section>
        );
      })()}

      {visible.length > 1 && <div className="mk-listing-heading"><div><span>Explore the network</span><h2>More verified opportunities</h2></div><span>{visible.length - 1} assets</span></div>}
      {visible.length === 0 ? (
        <div className="mk-empty">
          {active.length === 0
            ? "No tokenized assets yet. Mint an asset from the Owner dashboard to list it here."
            : "No listings match your filters."}
        </div>
      ) : (
        <div className="mk-grid">
          {visible.slice(1).map(a => {
            const CatIcon = CATEGORY_ICON[a.category] || HomeOutlined;
            const verified = a.attestation && a.attestation.approved;
            return (
              <div key={a.id} className="mk-card">
                <div className="mk-thumb" style={{ backgroundColor: a.accent, backgroundImage: a.image ? `linear-gradient(0deg, rgba(22,38,27,0.48), rgba(22,38,27,0.04)), url(${a.image})` : `radial-gradient(130% 120% at 25% 0%, ${a.accent}40, #eaf1ec 62%)` }}>
                  <span className="mk-cat">{a.category}</span>
                  <button className="mk-heart" title="Save"><HeartOutlined /></button>
                  <span className="mk-photo-icon"><CatIcon /></span>
                  {a.onHold && <span className="mk-hold">On hold</span>}
                  <div className="mk-funded">
                    <div className="mk-funded-top">
                      <span>{verified ? "Verified" : "Listed"}</span>
                      <span>{a.funded}%</span>
                    </div>
                    <div className="mk-bar"><div className="mk-bar-fill" style={{ width: `${a.funded}%`, background: a.accent }} /></div>
                  </div>
                </div>

                <div className="mk-body">
                  <div className="mk-title">{a.title}</div>
                  <div className="mk-loc"><EnvironmentOutlined /> {a.location}</div>

                  <div className="mk-stats">
                    <div>
                      <div className="mk-k">Token Price</div>
                      <div className="mk-v">{a.tokenPrice}</div>
                    </div>
                    <div className="mk-stats-right">
                      <div className="mk-k">Expected Yield</div>
                      <div className="mk-v mk-yield"><RiseOutlined /> {a.yieldPct}</div>
                    </div>
                  </div>

                  <div className="mk-meta">
                    <span className={`mk-risk ${RISK_CLASS[a.riskLevel] || "med"}`}>{a.riskLevel} risk</span>
                    <span className="mk-min">Min. {a.minInvest}</span>
                  </div>

                  <div className="mk-actions">
                    <button className="mk-btn ghost" onClick={() => setManageId(a.id)}>View details</button>
                    <button className="mk-btn primary" onClick={() => setManageId(a.id)}>Invest Now</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* details / invest modal */}
      <Modal
        visible={!!manageAsset}
        onCancel={() => setManageId(null)}
        footer={null}
        width={480}
        title={manageAsset ? manageAsset.title : ""}
        wrapClassName="db-modal"
      >
        {manageAsset &&
          (() => {
            const asset = manageAsset;
            const iAmOwner = isMe(asset.owner, address);
            const iAmLender = isMe(asset.lien.lender, address);
            return (
              <div className="mk-manage">
                <div className="mk-manage-grid">
                  <div><span className="mk-mk">Token</span><span className="mk-mv">#{asset.id}</span></div>
                  <div><span className="mk-mk">Category</span><span className="mk-mv">{asset.category}</span></div>
                  <div><span className="mk-mk">Owner</span><span className="mk-mv mono">{shortAddr(asset.owner)}</span></div>
                  <div><span className="mk-mk">Expected yield</span><span className="mk-mv">{asset.yieldPct}</span></div>
                  <div><span className="mk-mk">Status</span><span className="mk-mv">{asset.onHold ? "On hold" : asset.hasActiveLien ? "Encumbered" : "Transferable"}</span></div>
                  <div><span className="mk-mk">Min invest</span><span className="mk-mv">{asset.minInvest}</span></div>
                </div>

                <Divider style={{ margin: "16px 0" }} />

                {!asset.hasActiveLien && (
                  <div className="mk-action">
                    <div className="mk-action-label">Bank — register a lien</div>
                    <div className="mk-action-row">
                      <InputNumber placeholder="payoff (₹)" min={1} style={{ width: 180 }} value={lienAmt[asset.id]} onChange={v => setLienAmt(s => ({ ...s, [asset.id]: v }))} />
                      <Button onClick={() => registerLien(asset.id)} loading={busy} disabled={!lienAmt[asset.id]}>Register lien</Button>
                    </div>
                  </div>
                )}
                {asset.hasActiveLien && iAmLender && (
                  <div className="mk-action">
                    <div className="mk-action-label">You hold the lien ({formatINR(asset.lien.amount)})</div>
                    <Button onClick={() => releaseLien(asset.id)} loading={busy}>Release lien</Button>
                  </div>
                )}
                {asset.hasActiveLien && (
                  <div className="mk-action">
                    <div className="mk-action-label">Buyer — settle atomically (payoff {formatINR(asset.lien.amount)})</div>
                    <div className="mk-action-row">
                      <InputNumber placeholder={`sale price ≥ ${formatINR(asset.lien.amount)}`} min={0} style={{ width: 220 }} value={price[asset.id]} onChange={v => setPrice(s => ({ ...s, [asset.id]: v }))} />
                      <Button type="primary" onClick={() => settle(asset)} loading={busy} disabled={asset.onHold || iAmOwner}>Invest &amp; settle</Button>
                    </div>
                    <div className="mk-action-hint">Payoff → lender; remainder → seller; ownership → you. One atomic transaction.</div>
                    {asset.onHold && <div className="mk-action-warn">On hold — settlement blocked.</div>}
                  </div>
                )}
                {iAmOwner && (asset.hasActiveLien || asset.onHold) && (
                  <Button danger ghost block onClick={() => attemptDirectTransfer(asset)} style={{ marginTop: 8 }}>
                    Demo: attempt direct transfer (should be blocked)
                  </Button>
                )}
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}

function MkStyles() {
  return (
    <style>{`
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
      @media (max-width: 1050px) { .mk-featured { grid-template-columns: 1fr .9fr; } }
      @media (max-width: 700px) { .mk-featured { grid-template-columns: 1fr; }.mk-featured-photo { min-height: 240px; }.mk-featured-panel { padding: 20px; } }
      .mk-toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-top: -58px; margin-bottom: 18px; }
      .mk-tool { display: inline-flex; align-items: center; gap: 8px; background: var(--panel); border: 1px solid var(--border); color: var(--text); font-size: 13px; font-weight: 500; padding: 9px 14px; border-radius: 10px; cursor: pointer; }
      .mk-tool:hover { border-color: var(--ac); }
      .mk-caret { color: var(--muted); }

      .mk-tabs { display: flex; gap: 6px; flex-wrap: wrap; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 6px; margin-bottom: 22px; }
      .mk-tab { display: inline-flex; align-items: center; gap: 7px; background: transparent; border: none; color: var(--muted); font-size: 13.5px; font-weight: 500; padding: 8px 16px; border-radius: 9px; cursor: pointer; transition: all 0.14s ease; }
      .mk-tab:hover { color: var(--text); }
      .mk-tab.active { background: var(--panel-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }
      .mk-tab-count { font-size: 11px; color: var(--ac-2); background: rgba(40,104,245,0.14); border-radius: 999px; padding: 1px 7px; }

      .mk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 18px; }
      .mk-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; transition: border-color 0.16s ease, transform 0.16s ease; }
      .mk-card:hover { border-color: var(--ac); transform: translateY(-3px); }

      .mk-thumb { position: relative; height: 172px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border); background-position: center; background-size: cover; }
      .mk-cat { position: absolute; top: 12px; left: 12px; background: rgba(25,38,54,0.72); color: #fff; font-size: 11px; font-weight: 600; padding: 4px 11px; border-radius: 999px; backdrop-filter: blur(6px); text-transform: capitalize; }
      .mk-heart { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border-radius: 50%; background: rgba(25,38,54,0.72); border: none; color: #fff; cursor: pointer; backdrop-filter: blur(6px); }
      .mk-heart:hover { color: #ff7597; }
      .mk-hold { position: absolute; top: 48px; right: 12px; background: rgba(216,91,91,0.92); color: #fff; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
      .mk-funded { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 14px 12px; background: linear-gradient(to top, rgba(12,22,18,0.78), transparent); }
      .mk-funded-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 6px; }
      .mk-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.16); overflow: hidden; }
      .mk-bar-fill { height: 100%; border-radius: 999px; }

      .mk-body { padding: 15px 16px 16px; }
      .mk-title { font-size: 16px; font-weight: 600; color: var(--text); }
      .mk-loc { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); margin-top: 5px; }
      .mk-stats { display: flex; justify-content: space-between; margin-top: 15px; }
      .mk-stats-right { text-align: right; }
      .mk-k { font-size: 11.5px; color: var(--muted); }
      .mk-v { font-size: 16px; font-weight: 700; color: var(--text); margin-top: 3px; }
      .mk-yield { color: var(--ok); display: inline-flex; align-items: center; gap: 4px; }
      .mk-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
      .mk-risk { font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; }
      .mk-risk.low { background: rgba(82,200,138,0.14); color: var(--ok); }
      .mk-risk.med { background: rgba(224,166,75,0.14); color: #e0a64b; }
      .mk-risk.high { background: rgba(216,91,91,0.16); color: #e06c6c; }
      .mk-min { font-size: 12px; color: var(--muted); }

      .mk-actions { display: flex; gap: 10px; margin-top: 16px; }
      .mk-btn { flex: 1; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.14s ease; }
      .mk-btn.ghost { background: transparent; border: 1px solid var(--border); color: var(--text); }
      .mk-btn.ghost:hover { border-color: var(--ac); }
      .mk-btn.primary { background: var(--ac); border: 1px solid var(--ac); color: #fff; }
      .mk-btn.primary:hover { background: var(--ac-2); border-color: var(--ac-2); }

      .mk-empty { border: 1px dashed var(--border); border-radius: 16px; padding: 48px; text-align: center; color: var(--muted); font-size: 14px; }

      /* modal */
      .mk-manage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
      .mk-manage-grid > div { display: flex; flex-direction: column; }
      .mk-mk { font-size: 11.5px; color: var(--muted, #778295); }
      .mk-mv { font-size: 14px; font-weight: 600; color: var(--text, #202734); margin-top: 2px; }
      .mk-mv.mono { font-family: ui-monospace, Menlo, monospace; font-weight: 500; }
      .mk-action { margin-bottom: 16px; }
      .mk-action-label { font-size: 12.5px; font-weight: 600; color: var(--muted, #778295); margin-bottom: 8px; }
      .mk-action-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .mk-action-hint { font-size: 11.5px; color: var(--muted, #778295); margin-top: 8px; line-height: 1.5; }
      .mk-action-warn { font-size: 12px; color: #e06c6c; margin-top: 6px; }

      /* modal is portalled to <body>: re-declare theme + antd overrides */
      .db-modal { --ac:#2868f5; --ac-2:#4b83ff; --panel-2:#f7f8fa; --border:#e5e9ef; --text:#202734; --muted:#778295; --ok:#20a56a; }
      .db-modal .ant-modal-content { background: #ffffff; border: 1px solid #e5e9ef; border-radius: 16px; }
      .db-modal .ant-modal-header { background: #ffffff; border-bottom: 1px solid #e5e9ef; border-radius: 16px 16px 0 0; }
      .db-modal .ant-modal-title { color: #202734; font-weight: 600; }
      .db-modal .ant-modal-close-x { color: #778295; }
      .db-modal .ant-divider { border-color: #e5e9ef; }
      .db-modal .ant-input-number, .db-modal .ant-input-number-input { background: #f7f8fa; border-color: #e5e9ef; color: #202734; }
      .db-modal .ant-input-number-input::placeholder { color: #9aa3b0; }
      .db-modal .ant-input-number:hover { border-color: #2868f5; }
      .db-modal .ant-btn { background: #f7f8fa; border-color: #e5e9ef; color: #202734; border-radius: 8px; }
      .db-modal .ant-btn:hover { border-color: #2868f5; color: #fff; }
      .db-modal .ant-btn-primary { background: #2868f5; border-color: #2868f5; color: #fff; }
      .db-modal .ant-btn-primary:hover { background: #4b83ff; border-color: #4b83ff; }
      .db-modal .ant-btn-dangerous.ant-btn-background-ghost { color: #e06c6c; border-color: rgba(216,91,91,0.5); background: transparent; }
    `}</style>
  );
}
