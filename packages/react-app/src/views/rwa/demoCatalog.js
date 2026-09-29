// demoCatalog.js
//
// Presentation metadata for the seeded demo listings (see
// packages/hardhat/scripts/seed_rwa.js). Real assets carry an encrypted
// passport on IPFS that only recipients can decrypt; the seed assets instead
// store a readable "demo://property/N" CID, and this catalog supplies the
// human-facing card content (title, category, yield, risk …) used to render
// their marketplace cards. Purely cosmetic — none of it is trusted on-chain.

export const CATEGORIES = ["All", "Real estate"];

export const DEMO_LISTINGS = [
  {
    title: "Prestige Villa, Whitefield",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85",
    location: "Whitefield, Bengaluru",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "18%",
    risk: "Medium",
    minInvest: "₹5,000",
    funded: 60,
    accent: "#6C5CE7",
  },
  {
    title: "Sea-view Apartment, Bandra",
    image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
    location: "Bandra, Mumbai",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "14%",
    risk: "Medium",
    minInvest: "₹5,000",
    funded: 74,
    accent: "#3FB98C",
  },
  {
    title: "Farmland Plot, Devanahalli",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85",
    location: "Devanahalli, Bengaluru",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "11%",
    risk: "Medium",
    minInvest: "₹5,000",
    funded: 42,
    accent: "#D85B7A",
  },
  {
    title: "Commercial Unit, Cyber City",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=85",
    location: "Cyber City, Gurugram",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "13%",
    risk: "Low",
    minInvest: "₹5,000",
    funded: 88,
    accent: "#4F86F0",
  },
  {
    title: "Row House, Kompally",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85",
    location: "Kompally, Hyderabad",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "12%",
    risk: "Medium",
    minInvest: "₹5,000",
    funded: 55,
    accent: "#E0A64B",
  },
  {
    title: "Retail Space, T. Nagar",
    image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
    location: "T. Nagar, Chennai",
    category: "Real estate",
    tokenPrice: "₹500",
    yield: "10%",
    risk: "Medium",
    minInvest: "₹5,000",
    funded: 31,
    accent: "#C061D8",
  },
];

/** Resolve demo presentation metadata from an asset's on-chain metadataCID. */
export function demoInfoFor(metadataCID) {
  const m = /^demo:\/\/property\/(\d+)$/.exec(metadataCID || "");
  if (!m) return null;
  return DEMO_LISTINGS[Number(m[1]) - 1] || null;
}
