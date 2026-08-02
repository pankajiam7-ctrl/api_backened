const router = require("express").Router();


const {
    logFrame,
    getlogFrame,
    deletelogFrame
} = require("../controllers/logFrame.controller");

// 🔒 Admin only (add role check later)

router.post('/logFrame', logFrame);
router.get("/logFrame", getlogFrame);
router.delete("/logFrame/:id", deletelogFrame);


module.exports = router;