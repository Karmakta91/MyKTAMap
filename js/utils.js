function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

function choisirIcone(p) {
  if (!p.tags) return iconeDefault;
  if (p.tags.includes("salle")) return iconeSalle;
  if (p.tags.includes("pa")) return iconepa;
  if (p.tags.includes("pc")) return iconepc;
  if (p.tags.includes("pb")) return iconepb;
  if (p.tags.includes("vehicule")) return iconeVehicule;
  if (p.tags.includes("elec")) return iconeElec;
  if (p.tags.includes("epure")) return iconeEpure;
  if (p.tags.includes("ps")) return iconePS;
  if (p.tags.includes("info")) return iconeInfo;
  if (p.tags.includes("passage")) return iconePassage;
  if (p.tags.includes("chatiere")) return iconeChatiere;
  if (p.tags.includes("danger")) return iconeDanger;
  if (p.tags.includes("pe")) return iconepe;
  return iconeDefault;
}

function ajouterPointsDepuisJSON(url, layer) {
  fetch(url)
    .then(res => res.json())
    .then(json => {
      json.data.forEach(p => {

        var marker = L.marker(convertCoord(p.x, p.y), {
          icon: choisirIcone(p)
        });

        marker.bindPopup(
          `<b>${p.nom}</b><br>${p.description || ""}`
        );

        marker.addTo(layer);
      });
    });
}

function telechargerPlan() {
  const link = document.createElement('a');

  link.href = window.PLAN_CONFIG.plan.baseImage;
  link.download = window.PLAN_CONFIG.plan.name.replace(/\s+/g, "_") + ".png";

  link.click();
}