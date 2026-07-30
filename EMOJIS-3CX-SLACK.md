# Emojis personnalisés et synchronisés pour 3CX

Le userscript remplace les codes comme `:ah_ultime:` dans les messages déjà
envoyés. Le texte enregistré par 3CX reste inchangé : une personne sans le
userscript voit simplement `:ah_ultime:`.

## Organisation recommandée

Publier ces fichiers sur un serveur web HTTPS accessible à toute l’équipe :

```text
3cx-slack/
├── 3cx-slack-emojis.json
└── emojis/
    ├── ah_ultime.gif
    ├── bravo.png
    └── surprise.jpg
```

Le manifeste peut utiliser des chemins relatifs :

```json
{
  "version": 1,
  "emojis": {
    "ah_ultime": {
      "url": "emojis/ah_ultime.gif",
      "label": "Ah ultime"
    },
    "bravo": "emojis/bravo.png",
    "surprise": "emojis/surprise.jpg"
  }
}
```

Dans `3cx-slack-avatars.user.js`, renseigner une seule fois l’adresse du
manifeste :

```javascript
const CUSTOM_EMOJI_MANIFEST_URL =
  "https://votre-serveur/3cx-slack/3cx-slack-emojis.json";
```

Distribuer ensuite ce userscript à l’équipe. Pour utiliser un emoji :

```text
Bien joué :bravo:
```

## Synchronisation

- Le manifeste est vérifié au démarrage puis toutes les cinq minutes.
- Sa dernière version est conservée dans le navigateur si le serveur devient
  temporairement inaccessible.
- Ajouter ou remplacer un fichier dans le manifeste ne demande aucune
  modification du CSS.
- Les PNG, JPG, JPEG et GIF sont affichés en 32 × 32 px. Les GIF restent animés.
- Les codes sont insensibles à la casse et acceptent les lettres, chiffres,
  `_`, `+` et `-`.

Pour une mise à jour immédiate pendant un test, recharger l’onglet 3CX.

## Variante sans serveur de manifeste

Des URL absolues peuvent aussi être ajoutées directement dans
`INLINE_CUSTOM_EMOJIS` au début du userscript :

```javascript
const INLINE_CUSTOM_EMOJIS = {
  ah_ultime: "https://votre-serveur/emojis/ah_ultime.gif",
};
```

Cette variante est partagée avec le fichier JavaScript, mais toute modification
nécessite de redistribuer une nouvelle version du userscript.
