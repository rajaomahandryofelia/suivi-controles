interface Props {
    latitude: number;
    longitude: number;
  }
  
  // Petite carte OpenStreetMap centrée sur la position (aucune bibliothèque à installer)
  export default function CarteSite({ latitude, longitude }: Props) {
    const marge = 0.004;
    const zone = [longitude - marge, latitude - marge, longitude + marge, latitude + marge].join("%2C");
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${zone}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  
    return (
      <div className="sit-carte">
        <iframe title="Position du site sur la carte" src={src} loading="lazy" />
      </div>
    );
  }