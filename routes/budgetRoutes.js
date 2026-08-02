const router = require("express").Router();


const {
    budget,
    getbudget,
    deletebudget
} = require("../controllers/budget.controller");

// 🔒 Admin only (add role check later)

router.post('/budget', budget);
router.get("/budget", getbudget);
router.delete("/budget/:id", deletebudget);


module.exports = router;