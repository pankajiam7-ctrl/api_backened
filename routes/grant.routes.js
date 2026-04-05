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
    getPdf
} = require("../controllers/grant.controller");

// Scraper
router.post("/scrap", createGrantScrap);
router.post("/scrapDetails", createGrantsDetail);
router.post("/addSample", updateGrantDetails);
router.post('/addPdf', addPdfURL);
router.get('/getPdf',getPdf)

// Static / filter routes (must come before /:id)
router.get("/search", searchGrants);
router.get("/filters/meta", getFiltersMeta);
router.get("/featured", getFeatured);
router.get("/expiring-soon", expiringSoon);

// CRUD
router.get("/", getGrants);
router.post("/", createGrant);
router.put("/:id", updateGrant);
router.delete("/:id", deleteGrant);
router.patch("/:id", updateSingleField);

router.get("/:id", getGrantById);




module.exports = router;
