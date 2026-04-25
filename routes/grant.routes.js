const express = require("express");
const router = express.Router();

const {
    getGrants,
    searchGrants,
    getFiltersMeta,
    getFeatured,
    expiringSoon,
    getGrantById,
    createGrant,
    updateGrant,
    deleteGrant,
    updateSingleField,
    createGrantScrap,
    createGrantsDetail,
    updateGrantDetails,
    addPdfURL,
    getPdf,
    saveGrantJSON,
    getGrantsByTitleURL,
    searchGrant,
    latestGrant,
    typeSearch
} = require("../controllers/grant.controller");

// Scraper
router.post("/scrap", createGrantScrap);
router.post("/scrapDetails", createGrantsDetail);
router.post("/addSample", updateGrantDetails);
router.post('/addPdf', addPdfURL);
router.get('/getPdf', getPdf);

// Static / filter routes (must come before /:id)
router.get("/search", searchGrants);
router.get("/filters/meta", getFiltersMeta);
router.get("/featured", getFeatured);
router.get("/expiring-soon", expiringSoon);
//Search
router.get("/latest-grant/:type", latestGrant);
router.get("/type-search", typeSearch);

// ✅ Move here ABOVE /:titleUrl
router.get('/search-grants', searchGrant);

// CRUD
router.get("/", getGrants);
router.post("/", createGrant);
router.put("/:id", updateGrant);
router.delete("/:id", deleteGrant);
router.patch("/:id", updateSingleField);

router.post('/save-grants', saveGrantJSON); // ✅ move above /:titleUrl too
router.get("www/:id", getGrantById);
router.get('/:titleUrl', getGrantsByTitleURL); // ⚠️ this catches everything above it



module.exports = router;
