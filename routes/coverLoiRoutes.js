const router = require("express").Router();


const {
    coverLoi,
    getCoverLoi,
    deleteCoverLoi
} = require("../controllers/coveLoi.controller");

// 🔒 Admin only (add role check later)

router.post('/coverLoi', coverLoi);
router.get("/cover-loi", getCoverLoi);
router.delete("/cover-loi/:id", deleteCoverLoi);


module.exports = router;