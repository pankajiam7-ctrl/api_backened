// fetchRealGrants.js
// ─────────────────────────────────────────────────
// Run on YOUR machine / server (not Claude sandbox)
// Usage:  node fetchRealGrants.js
// Needs:  npm install axios mongoose dotenv
// ─────────────────────────────────────────────────

import axios     from 'axios'
import mongoose  from 'mongoose'
import dotenv    from 'dotenv'
dotenv.config()

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ngo_grants'

// ── Grant Model ───────────────────────────────────────────────────────────
const grantSchema = new mongoose.Schema({
  title:      String,
  donor:      String,
  category:   String,
  isOpen:     { type: Boolean, default: true },
  sourceUrl:  String,
  sourceName: String,
  imageUrl:   [String],
  raw: {
    deadline:     String,
    amount:       String,
    region:       String,
    donor_agency: String,
    description:  String,
  },
  financials: {
    raw:      String,
    currency: { type: String, default: 'USD' },
    min:      Number,
    max:      Number,
  },
  geography: {
    country: [String],
    region:  String,
  },
  ai: {
    inferred_focus_country: [String],
    inferred_focus_areas:   [String],
  },
}, { timestamps: true })

const Grant = mongoose.models.Grant || mongoose.model('Grant', grantSchema)

// ── Utility ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function isOpen(deadlineStr) {
  if (!deadlineStr) return true
  const d = new Date(deadlineStr)
  return isNaN(d.getTime()) ? true : d > new Date()
}

// ── SOURCE 1: ReliefWeb ───────────────────────────────────────────────────
// Best source for humanitarian/NGO grants in developing countries
async function fetchReliefWeb(limit = 20) {
  console.log('\n📡 Fetching from ReliefWeb...')
  const results = []

  try {
    const res = await axios.post(
      'https://api.reliefweb.int/v1/jobs?appname=ngo-grants-platform',
      {
        limit,
        offset: 0,
        fields: {
          include: [
            'title', 'body', 'date', 'source', 'country',
            'theme', 'type', 'status', 'url'
          ]
        },
        filter: {
          operator: 'AND',
          conditions: [
            { field: 'status', value: 'published' },
          ]
        },
        sort: ['date.created:desc']
      },
      { timeout: 15000 }
    )

    const items = res.data?.data || []
    console.log(`   ✅ ReliefWeb: ${items.length} items fetched`)

    for (const item of items) {
      const f = item.fields || {}
      const countries = (f.country || []).map(c => c.name).filter(Boolean)
      const themes    = (f.theme   || []).map(t => t.name).filter(Boolean)
      const source    = (f.source  || []).map(s => s.name).filter(Boolean).join(', ')

      results.push({
        title:      f.title || 'Untitled',
        donor:      source || 'ReliefWeb',
        category:   themes[0] || 'Humanitarian',
        isOpen:     f.status === 'published',
        sourceUrl:  f.url || '',
        sourceName: 'ReliefWeb',
        raw: {
          deadline:     f.date?.closing || '',
          amount:       'See posting',
          region:       countries[0] || 'Global',
          donor_agency: source,
          description:  (f.body || '').slice(0, 500),
        },
        financials: {
          raw:      'See posting',
          currency: 'USD',
        },
        geography: {
          country: countries,
          region:  countries[0] || 'Global',
        },
        ai: {
          inferred_focus_country: countries,
          inferred_focus_areas:   themes,
        },
      })
    }
  } catch (err) {
    console.error(`   ❌ ReliefWeb error: ${err.message}`)
  }

  return results
}

// ── SOURCE 2: UN OCHA FTS (Funding Flows) ────────────────────────────────
// Real humanitarian funding data
async function fetchOCHA(limit = 15) {
  console.log('\n📡 Fetching from UN OCHA FTS...')
  const results = []

  try {
    const res = await axios.get(
      `https://api.fts.unocha.org/v2/public/flow?limit=${limit}&sortField=date&sortOrder=desc`,
      { timeout: 15000 }
    )

    const flows = res.data?.data?.flows || []
    console.log(`   ✅ OCHA FTS: ${flows.length} flows fetched`)

    for (const flow of flows) {
      const orgs       = flow.organizationTypes || []
      const donor      = orgs.find(o => o.type === 'Donor')?.name  || 'UN OCHA'
      const recipient  = orgs.find(o => o.type === 'Recipient')?.name || ''
      const locations  = (flow.locations || []).map(l => l.name).filter(Boolean)
      const categories = (flow.categories || []).map(c => c.name).filter(Boolean)

      results.push({
        title:      flow.description || `Humanitarian Flow – ${locations[0] || 'Global'}`,
        donor:      donor,
        category:   categories[0] || 'Humanitarian',
        isOpen:     true,
        sourceUrl:  `https://fts.unocha.org/flows/${flow.id}`,
        sourceName: 'UN OCHA FTS',
        raw: {
          deadline:     '',
          amount:       flow.amountUSD ? `$${Number(flow.amountUSD).toLocaleString()}` : 'N/A',
          region:       locations[0] || 'Global',
          donor_agency: donor,
          description:  flow.description || '',
        },
        financials: {
          raw:      flow.amountUSD ? `$${Number(flow.amountUSD).toLocaleString()}` : 'N/A',
          currency: 'USD',
          min:      Number(flow.amountUSD) || 0,
          max:      Number(flow.amountUSD) || 0,
        },
        geography: {
          country: locations,
          region:  locations[0] || 'Global',
        },
        ai: {
          inferred_focus_country: locations,
          inferred_focus_areas:   categories,
        },
      })
    }
  } catch (err) {
    console.error(`   ❌ OCHA error: ${err.message}`)
  }

  return results
}

// ── SOURCE 3: World Bank Projects ────────────────────────────────────────
// Development projects in developing countries
async function fetchWorldBank(limit = 15) {
  console.log('\n📡 Fetching from World Bank...')
  const results = []

  try {
    const res = await axios.get(
      `https://search.worldbank.org/api/v2/projects?format=json&rows=${limit}&os=0&orderby=boarddate&sort=desc&status=Active`,
      { timeout: 15000 }
    )

    const projects = res.data?.projects || {}
    const items    = Object.values(projects).filter(p => p && p.id)
    console.log(`   ✅ World Bank: ${items.length} projects fetched`)

    for (const p of items) {
      const countries = p.countryname ? [p.countryname] : []
      const sectors   = p.sector1?.Name ? [p.sector1.Name] : []

      results.push({
        title:      p.project_name || 'World Bank Project',
        donor:      'World Bank',
        category:   sectors[0] || 'Development',
        isOpen:     p.status === 'Active',
        sourceUrl:  `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`,
        sourceName: 'World Bank',
        raw: {
          deadline:     p.closingdate || '',
          amount:       p.totalamt ? `$${Number(p.totalamt).toLocaleString()}` : 'N/A',
          region:       p.regionname || countries[0] || '',
          donor_agency: 'World Bank',
          description:  p.project_abstract?.cdata || '',
        },
        financials: {
          raw:      p.totalamt ? `$${Number(p.totalamt).toLocaleString()}` : 'N/A',
          currency: 'USD',
          min:      Number(p.totalamt) || 0,
          max:      Number(p.totalamt) || 0,
        },
        geography: {
          country: countries,
          region:  p.regionname || '',
        },
        ai: {
          inferred_focus_country: countries,
          inferred_focus_areas:   sectors,
        },
      })
    }
  } catch (err) {
    console.error(`   ❌ World Bank error: ${err.message}`)
  }

  return results
}

// ── SOURCE 4: Grants.gov ──────────────────────────────────────────────────
// US federal grants — many are global/international
async function fetchGrantsGov(limit = 10) {
  console.log('\n📡 Fetching from Grants.gov...')
  const results = []

  try {
    const res = await axios.post(
      'https://api.grants.gov/v2/opportunities/search',
      {
        keyword:    'international development NGO',
        oppStatuses: 'posted',
        rows:        limit,
        sortBy:      'openDate|desc',
      },
      {
        headers:  { 'Content-Type': 'application/json' },
        timeout:  15000,
      }
    )

    const opps = res.data?.oppHits || []
    console.log(`   ✅ Grants.gov: ${opps.length} opportunities fetched`)

    for (const opp of opps) {
      results.push({
        title:      opp.title || 'Federal Grant Opportunity',
        donor:      opp.agencyName || 'US Federal Government',
        category:   opp.oppCategory?.name || 'Grant',
        isOpen:     opp.oppStatus === 'posted',
        sourceUrl:  `https://www.grants.gov/search-results-detail/${opp.id}`,
        sourceName: 'Grants.gov',
        raw: {
          deadline:     opp.closeDate || '',
          amount:       opp.awardCeiling ? `$${Number(opp.awardCeiling).toLocaleString()}` : 'N/A',
          region:       'Global',
          donor_agency: opp.agencyName,
          description:  opp.synopsis || '',
        },
        financials: {
          raw:      opp.awardCeiling ? `$${Number(opp.awardCeiling).toLocaleString()}` : 'N/A',
          currency: 'USD',
          min:      Number(opp.awardFloor)   || 0,
          max:      Number(opp.awardCeiling) || 0,
        },
        geography: {
          country: [],
          region:  'Global',
        },
        ai: {
          inferred_focus_country: ['Global'],
          inferred_focus_areas:   [opp.oppCategory?.name || 'International Development'],
        },
      })
    }
  } catch (err) {
    console.error(`   ❌ Grants.gov error: ${err.message}`)
  }

  return results
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 NGO Grant Fetcher — Starting...')
  console.log('━'.repeat(50))

  await mongoose.connect(MONGO_URI)
  console.log('✅ MongoDB connected')

  // Fetch from all sources in parallel
  const [reliefweb, ocha, worldbank, grantsgov] = await Promise.allSettled([
    fetchReliefWeb(20),
    fetchOCHA(15),
    fetchWorldBank(15),
    fetchGrantsGov(10),
  ])

  const all = [
    ...(reliefweb.status  === 'fulfilled' ? reliefweb.value  : []),
    ...(ocha.status       === 'fulfilled' ? ocha.value       : []),
    ...(worldbank.status  === 'fulfilled' ? worldbank.value  : []),
    ...(grantsgov.status  === 'fulfilled' ? grantsgov.value  : []),
  ]

  console.log('\n━'.repeat(50))
  console.log(`📦 Total fetched: ${all.length} grants`)

  if (all.length === 0) {
    console.log('⚠️  No grants fetched — check your internet connection')
    process.exit(1)
  }

  // Insert (skip duplicates by title)
  let inserted = 0
  let skipped  = 0

  for (const grant of all) {
    try {
      const exists = await Grant.findOne({ title: grant.title })
      if (exists) { skipped++; continue }
      await Grant.create(grant)
      inserted++
    } catch (err) {
      console.error(`  ⚠️  Skip: ${err.message}`)
      skipped++
    }
  }

  // Summary
  console.log('\n🎉 Done!')
  console.log(`   ✅ Inserted: ${inserted}`)
  console.log(`   ⏭️  Skipped (duplicates): ${skipped}`)

  // Show breakdown by source
  const bySource = all.reduce((acc, g) => {
    acc[g.sourceName] = (acc[g.sourceName] || 0) + 1
    return acc
  }, {})
  console.log('\n   By source:')
  Object.entries(bySource).forEach(([s, c]) => console.log(`   • ${s}: ${c}`))

  await mongoose.disconnect()
  console.log('\n🔌 Disconnected')
}

main().catch(console.error)
