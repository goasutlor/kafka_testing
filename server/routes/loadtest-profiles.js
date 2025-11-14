const express = require('express');
const router = express.Router();

// In-memory profile storage
// In production, this should be stored in a database
let profiles = [];

// Create a new profile
function createProfile(name, type, config) {
  const profile = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    name,
    type, // 'producer' or 'consumer'
    config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  profiles.push(profile);
  return profile;
}

// Update profile
function updateProfile(profileId, updates) {
  const profile = profiles.find(p => p.id === profileId);
  if (profile) {
    Object.assign(profile, updates);
    profile.updatedAt = new Date().toISOString();
  }
  return profile;
}

// Delete profile
function deleteProfile(profileId) {
  const index = profiles.findIndex(p => p.id === profileId);
  if (index !== -1) {
    profiles.splice(index, 1);
    return true;
  }
  return false;
}

// Get all profiles
function getAllProfiles(type = null) {
  if (type) {
    return profiles.filter(p => p.type === type);
  }
  return [...profiles];
}

// Get profile by ID
function getProfile(profileId) {
  return profiles.find(p => p.id === profileId);
}

// API Routes
router.post('/', (req, res) => {
  try {
    const { name, type, config } = req.body;
    if (!name || !type || !config) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, and config are required',
      });
    }
    const profile = createProfile(name, type, config);
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    const allProfiles = getAllProfiles(type);
    res.json({ success: true, profiles: allProfiles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const profile = getProfile(profileId);
    if (profile) {
      res.json({ success: true, profile });
    } else {
      res.status(404).json({ success: false, message: 'Profile not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const updates = req.body;
    const profile = updateProfile(profileId, updates);
    if (profile) {
      res.json({ success: true, profile });
    } else {
      res.status(404).json({ success: false, message: 'Profile not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const deleted = deleteProfile(profileId);
    if (deleted) {
      res.json({ success: true, message: 'Profile deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Profile not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.createProfile = createProfile;
module.exports.updateProfile = updateProfile;
module.exports.deleteProfile = deleteProfile;
module.exports.getAllProfiles = getAllProfiles;
module.exports.getProfile = getProfile;

