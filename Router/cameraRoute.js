const express = require('express')
const router = express.Router()
const { getCameraStream, getHomePage } = require('../Services/cameraService')

router.get('/', getHomePage)
router.get('/video_feed/:camId', getCameraStream)

module.exports = router
