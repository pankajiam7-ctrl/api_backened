const express = require("express");
const router = express.Router();

const {
   dashboard,
   saveStatus,
   dashboardStatus,
   generateProposal 
} = require("../controllers/proposal.controller");

// downmlod Save
router.post("/dashboard", dashboard);
// Like Save
router.post("/save",saveStatus)

// Get Download and Like
router.get("/:userId", dashboardStatus);

router.post("/generate", generateProposal)







module.exports = router;
