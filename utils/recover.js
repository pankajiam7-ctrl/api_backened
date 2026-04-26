const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dugtdsotv',
  api_key: '599389216363838',
  api_secret: 'AW_SIsFVjUgV_yGqyGehsOsyrsw'
});

async function getAllFiles() {
  const result = await cloudinary.api.resources({
    resource_type: 'raw',
    type: 'upload',
    max_results: 100
  });

  result.resources.forEach(file => {
    console.log(file.public_id + " | " + file.secure_url);
  });
}

getAllFiles();