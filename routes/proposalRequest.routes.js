const express = require("express");
const router = express.Router();

const {
 requestProposal  
} = require("../controllers/proposalRequest.controller");


router.post("/request", requestProposal);


module.exports = router;
