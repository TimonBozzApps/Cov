var express = require('express');
var router = express.Router();

router.get('/change/', function(req, res, next) {
    const area = req.query.area;
    res.cookie('area', area).redirect("/");
});

module.exports = router;