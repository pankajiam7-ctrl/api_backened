const router = require("express").Router();
const { protect } = require("../middleware/auth.middleware");

const {
    generateProposal,
    regenerateProposal,
    getStatus,
    scoreProposal,
    getProposals,
    getProposalById,
    createProposal,
    updateProposal,
    updateStatus,
    deleteProposal,
    duplicateProposal,
    downloadProposal
} = require("../controllers/proposal.controller");

const {
    checkDownloadLimit
} = require("../middleware/downloadLimit.middleware");

router.post("/generate", protect, generateProposal);
router.post("/regenerate/:id", protect, regenerateProposal);
router.get("/generate/status/:jobId", protect, getStatus);
router.post("/score", protect, scoreProposal);

router.get("/", protect, getProposals);
router.get("/:id", protect, getProposalById);

router.post("/", protect, createProposal);
router.put("/:id", protect, updateProposal);
router.patch("/:id/status", protect, updateStatus);
router.delete("/:id", protect, deleteProposal);
router.post("/:id/duplicate", protect, duplicateProposal);

router.get("/:id/download", protect, checkDownloadLimit, downloadProposal);


module.exports = router;