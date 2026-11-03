
"use client";

import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";

type ProfileResponse = {
  profileImagePath: string | null;
  message?: string;
};

type Point = {
  x: number;
  y: number;
};

type Area = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function createCroppedImage(
  imageSrc: string,
  crop: Area,
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load the image."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare the cropped image.");
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not crop the image."));
      },
      "image/jpeg",
      0.9,
    );
  });
}

export default function ProfilePicture() {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  async function loadProfilePicture() {
    try {
      const response = await fetch("/api/profile-picture", {
        cache: "no-store",
      });

      const data: ProfileResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load profile picture.");
      }

      setImagePath(data.profileImagePath);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load profile picture.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfilePicture();
  }, []);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedImage(reader.result);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedArea(null);
      }
    };

    reader.onerror = () => setError("Could not read the selected image.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function uploadCroppedImage() {
    if (!selectedImage || !croppedArea) {
      setError("Select an image and adjust its crop first.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const blob = await createCroppedImage(selectedImage, croppedArea);
      const formData = new FormData();

      formData.append("file", blob, "profile.jpg");

      const response = await fetch("/api/profile-picture", {
        method: "POST",
        body: formData,
      });

      const data: ProfileResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      setImagePath(data.profileImagePath);
      setSelectedImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const pictureUrl = imagePath
    ? imagePath.startsWith("http")
      ? imagePath
      : `http://localhost:4002${imagePath}`
    : null;

  return (
    <section className="profile-picture-section">
      <h2>Your profile picture</h2>

      {loading ? (
        <p>Loading profile picture...</p>
      ) : (
        <button
          type="button"
          className="profile-avatar"
          onClick={() => pictureUrl && setPreviewOpen(true)}
          aria-label="View profile picture"
        >
          {pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pictureUrl} alt="Your profile" />
          ) : (
            <span aria-hidden="true">👤</span>
          )}
        </button>
      )}

      <div>
        <label htmlFor="profile-image-input">
          {imagePath ? "Replace picture" : "Choose picture"}
        </label>
        <input
          id="profile-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
        />
      </div>

      {selectedImage && (
        <div className="crop-dialog">
          <h3>Crop your picture</h3>

          <div className="crop-container">
            <Cropper
              image={selectedImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setCroppedArea(pixels)}
            />
          </div>

          <label htmlFor="profile-zoom">Zoom</label>
          <input
            id="profile-zoom"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />

          <div>
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              disabled={uploading}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={uploadCroppedImage}
              disabled={uploading || !croppedArea}
            >
              {uploading ? "Uploading..." : "Crop and upload"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      {previewOpen && pictureUrl && (
        <div
          className="profile-preview-overlay"
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <button
            type="button"
            className="profile-preview-close"
            onClick={() => setPreviewOpen(false)}
            aria-label="Close picture preview"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pictureUrl}
            alt="Enlarged profile"
            className="profile-preview-image"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
