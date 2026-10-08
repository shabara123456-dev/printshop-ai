const categoryStyles: Record<string, { tone: string; mark: string; form: 'cards' | 'sheet' | 'banner' | 'sticker' | 'book' | 'shirt' | 'box' | 'mug' | 'label' }> = {
  business_cards: { tone: '#b0c9a8', mark: 'PRINTSHOP / STUDIO', form: 'cards' }, flyers: { tone: '#e3a97d', mark: 'MAKE IT MATTER', form: 'sheet' },
  posters: { tone: '#8b9bd5', mark: 'FORM / SPACE', form: 'sheet' }, banners: { tone: '#d38f83', mark: 'OPEN / TODAY', form: 'banner' },
  stickers: { tone: '#d6b261', mark: 'GOOD THINGS', form: 'sticker' }, invitations: { tone: '#ce9cae', mark: 'A DAY TO KEEP', form: 'cards' },
  brochures: { tone: '#80b2ad', mark: 'A CLOSER LOOK', form: 'book' }, menus: { tone: '#c98c60', mark: 'CAFÉ / MENU', form: 'book' },
  certificates: { tone: '#c2a765', mark: 'WITH HONOUR', form: 'sheet' }, booklets: { tone: '#8e9a7d', mark: 'FIELD NOTES', form: 'book' },
  notebooks: { tone: '#a57f70', mark: 'IDEAS, IN PRINT', form: 'book' }, calendars: { tone: '#7d9ea2', mark: 'A YEAR / AHEAD', form: 'sheet' },
  labels: { tone: '#c89260', mark: 'ORIGIN / 01', form: 'label' }, packaging: { tone: '#aa9578', mark: 'MADE WITH CARE', form: 'box' },
  apparel: { tone: '#8296bc', mark: 'PRINTSHOP GOODS', form: 'shirt' }, folders: { tone: '#947caa', mark: 'YOUR NEXT IDEA', form: 'cards' },
  stationery: { tone: '#8ba28a', mark: 'EVERY DETAIL', form: 'sheet' }, gifts: { tone: '#b89272', mark: 'A GOOD MORNING', form: 'mug' },
  bags: { tone: '#9b9c76', mark: 'CARRY GOOD IDEAS', form: 'box' }
};

/** Original vector sample artwork. These are product illustrations, not shop/customer photographs. */
export function ProductArtwork({ category, label }: { category: string; label?: string }) {
  const style = categoryStyles[category] ?? { tone: '#7c99b5', mark: 'PRINTSHOP / PRINT', form: 'sheet' as const };
  const artwork = style.form === 'cards' ? <><rect x="43" y="45" width="148" height="94" rx="5" fill="#e7e1d5" transform="rotate(-8 43 45)"/><rect x="65" y="54" width="145" height="92" rx="5" fill="#f6f3ed" transform="rotate(5 65 54)"/><circle cx="170" cy="79" r="12" fill={style.tone}/><text x="84" y="100" className="art-mark">{style.mark}</text><path d="M85 113h69" stroke="#34383d" opacity=".35"/></>
    : style.form === 'banner' ? <><path d="M88 153V49h78v104" fill="#eee9df" stroke="#b1afa8"/><path d="M92 53h70v94H92z" fill={style.tone}/><path d="M96 59h62v81H96z" fill="#1c2229"/><text x="105" y="84" className="art-mark light">{style.mark}</text><path d="M127 148v17M101 165h53" stroke="#adb3b5" strokeWidth="5" strokeLinecap="round"/></>
    : style.form === 'sticker' ? <><rect x="53" y="45" width="145" height="100" rx="8" fill="#f0ede4" transform="rotate(-5 53 45)"/><g fill={style.tone} stroke="#fff" strokeWidth="4"><circle cx="91" cy="83" r="19"/><rect x="124" y="64" width="44" height="32" rx="10"/><path d="M83 115l10-12 10 12-10 12z"/></g><text x="119" y="122" className="art-mark">{style.mark}</text></>
    : style.form === 'book' ? <><rect x="61" y="34" width="130" height="130" rx="5" fill="#f0ede4" transform="rotate(4 61 34)"/><path d="M89 42h92v116H89z" fill={style.tone}/><path d="M98 49h4v102h-4z" fill="#202328" opacity=".55"/><text x="112" y="84" className="art-mark light">{style.mark}</text><path d="M112 96h52M112 103h40" stroke="#fff" strokeWidth="2" opacity=".5"/></>
    : style.form === 'shirt' ? <><path d="M93 56l22-13h29l22 13 25 15-15 23-16-8v79H79V86l-16 8-15-23z" fill={style.tone} stroke="#eee9df" strokeWidth="3"/><text x="96" y="111" className="art-mark light">{style.mark}</text></>
    : style.form === 'box' ? <><path d="M74 71l55-29 57 28-56 30z" fill="#e8dfcf"/><path d="M74 71v61l56 30V100z" fill={style.tone}/><path d="M130 100l56-30v62l-56 30z" fill="#c5ad8b"/><text x="91" y="112" className="art-mark light">PRINTSHOP</text></>
    : style.form === 'mug' ? <><path d="M74 57h99v83a20 20 0 0 1-20 20H94a20 20 0 0 1-20-20z" fill="#eee9df"/><path d="M173 74h16a17 17 0 0 1 0 34h-17" fill="none" stroke="#eee9df" strokeWidth="12"/><path d="M92 92h63v35H92z" fill={style.tone}/><text x="96" y="114" className="art-mark">{style.mark}</text></>
    : style.form === 'label' ? <><rect x="54" y="43" width="145" height="104" rx="6" fill="#f1eee6" transform="rotate(-4 54 43)"/><rect x="77" y="59" width="55" height="36" rx="18" fill={style.tone}/><rect x="137" y="60" width="44" height="36" rx="4" fill="#e3d7c5"/><rect x="76" y="103" width="47" height="29" rx="14" fill="#ced4c3"/><text x="137" y="119" className="art-mark">{style.mark}</text></>
    : <><rect x="68" y="30" width="125" height="142" rx="3" fill="#efebe2" transform="rotate(3 68 30)"/><rect x="82" y="39" width="116" height="133" rx="3" fill={style.tone}/><path d="M98 62h82M98 69h59" stroke="#fff" strokeWidth="2" opacity=".56"/><circle cx="153" cy="120" r="25" fill="#1e242a" opacity=".87"/><text x="94" y="95" className="art-mark light">{style.mark}</text></>;

  return <div className={`product-art product-art-${style.form}`} aria-label={`${label ?? 'Print product'} illustrative product sample`} role="img">
    <svg viewBox="0 0 240 190" aria-hidden="true"><defs><linearGradient id={`glow-${style.form}-${category}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={style.tone} stopOpacity=".28"/><stop offset="1" stopColor="#111318" stopOpacity="0"/></linearGradient></defs><rect width="240" height="190" rx="14" fill="#15181d"/><circle cx="194" cy="39" r="73" fill={`url(#glow-${style.form}-${category})`}/><ellipse cx="124" cy="158" rx="83" ry="13" fill="#070809" opacity=".55"/>{artwork}</svg>
    <span className="product-art-note">PRINTSHOP · CONCEPT SAMPLE</span>
  </div>;
}

// Free Unsplash reference photos, selected for the actual print product shown.
// These are examples, not work produced by or owned by the shop.
type ReferencePhoto = { id: string; source: string; description: string };
const photo = (id: string, slug: string, description: string): ReferencePhoto => ({
  id,
  source: `https://unsplash.com/photos/${slug}`,
  description
});
const categoryPhotos: Record<string, ReferencePhoto> = {
  business_cards: photo('1623305463957-df17547327cb', 'two-blank-business-cards-sitting-on-top-of-each-other-XdlhXRH_UJw', 'Blank business cards'),
  flyers: photo('1769893715447-8f12c382e49c', 'folded-brochures-and-pamphlets-stacked-together-FaIwAogR7eE', 'Printed flyers and folded brochures'),
  posters: photo('1534267933751-06d5943f27f5', 'posters-mounted-on-building-wall-during-daytime-QsDPS-Qnkwg', 'Posters displayed on a wall'),
  banners: photo('1762325393954-5300a6e35f5b', 'a-blank-white-rectangular-sign-leaning-forward-0GywLiHMUTU', 'Vertical display banner mockup'),
  stickers: photo('1669292618188-7446a2cc1f07', 'a-group-of-drawings-on-a-table-LYZ66xHoi-s', 'Printed sticker sheet'),
  invitations: photo('1742581659446-6260fc707e7d', 'wedding-invitations-and-stationery-displayed-with-greenery-5ZribvTyQVQ', 'Wedding invitation and stationery set'),
  brochures: photo('1769893715447-8f12c382e49c', 'folded-brochures-and-pamphlets-stacked-together-FaIwAogR7eE', 'Folded brochures and pamphlets'),
  menus: photo('1545105090-b8a3fe3f87f2', 'menu-book-DKsXPBMJkkE', 'Printed menu book'),
  certificates: photo('1578130577682-5bde6205fb1d', 'certificate-paper-on-shelf-FnAsN2Og-vk', 'Certificate paper'),
  booklets: photo('1545105090-b8a3fe3f87f2', 'menu-book-DKsXPBMJkkE', 'Printed bound booklet example'),
  notebooks: photo('1518082091569-ccaa5d0c845a', 'calendar-notebook-with-highlighter-pens-BJ6w75UwMf8', 'Notebook and stationery flat lay'),
  calendars: photo('1518082091569-ccaa5d0c845a', 'calendar-notebook-with-highlighter-pens-BJ6w75UwMf8', 'Calendar planning notebook'),
  labels: photo('1669292618143-8e0337388811', 'a-box-with-a-label-on-it-E_dvFxEX9XU', 'Printed label on product packaging'),
  packaging: photo('1669292618143-8e0337388811', 'a-box-with-a-label-on-it-E_dvFxEX9XU', 'Printed packaging with a product label'),
  apparel: photo('1517309561013-16f6e4020305', 'white-and-black-we-do-it-with-style-printed-shirt-HToDV_gYh1A', 'Printed T-shirt'),
  folders: photo('1623305463957-df17547327cb', 'two-blank-business-cards-sitting-on-top-of-each-other-XdlhXRH_UJw', 'Cardstock reference for presentation folders'),
  stationery: photo('1518082091569-ccaa5d0c845a', 'calendar-notebook-with-highlighter-pens-BJ6w75UwMf8', 'Notebook and office stationery'),
  gifts: photo('1542556398-3c9a71885fab', 'white-fill-me-up-with-tea-printed-mug-8jQ9zzTiyAw', 'Printed ceramic mug'),
  bags: photo('1780480999319-ba6a502ed72c', 'canvas-tote-bag-with-keep-shining-text-and-colorful-designs-XjEMVyeqpeA', 'Printed canvas tote bag')
};

export function ProductImage({ category, label }: { category: string; label: string }) {
  const reference = categoryPhotos[category];
  return <div className="product-image-frame"><ProductArtwork category={category} label={label} />{reference && <><img className="product-photo" src={`https://images.unsplash.com/photo-${reference.id}?auto=format&fit=crop&w=1000&q=82`} alt={`${reference.description} — reference example for ${label}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} /><span className="product-photo-note" title={`Unsplash photo source: ${reference.source}`}>UNSPLASH REFERENCE</span></>}</div>;
}
