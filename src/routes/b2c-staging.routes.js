const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/b2c-staging.controller');
const router = express.Router();
router.use(auth);
router.get('/', controller.list);
module.exports = router;
