# 3CX Modern Theme

Un thème pour le client web **3CX**, avec une présentation inspirée de Slack et quelques outils pour rendre les discussions plus pratiques.

## Ce que fait le thème

- Affiche les messages avec les noms et portraits des participants, dans une mise en page plus lisible.
- Propose un thème clair ou sombre, une couleur personnalisable et un alignement des messages au choix.
- Remplace le dernier indicateur de lecture par le portrait de l’interlocuteur dans les discussions individuelles.
- Préserve la transparence des aperçus PNG, WebP et GIF.
- Ajoute des **favoris avec épingles et notes personnelles**, ainsi qu’une **galerie des images et documents de la conversation ouverte**.
- Ajoute des emojis et sons de notification personnalisés, avec un panneau de réglages repliable.

## Installation

1. Installe l’extension **[Tampermonkey](https://www.tampermonkey.net/)** dans ton navigateur.
2. Sur Chrome, active **« Autoriser les scripts utilisateurs »** dans les détails de l’extension Tampermonkey. Si nécessaire, consulte [l’aide officielle](https://www.tampermonkey.net/faq.php?q=Q209).
3. Clique sur **[Installer le thème](https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js)**, puis sur **Installer** dans la fenêtre Tampermonkey.
4. Ouvre **[3CX](https://decindustrie.3cx.no:5001/)**, ou recharge sa page si elle est déjà ouverte.

**Le CSS est chargé automatiquement : aucun fichier à copier et aucune extension Stylish/Stylus à installer.** Si tu utilisais une ancienne version du thème dans Stylish/Stylus, désactive cet ancien style.

Le dépôt est actuellement configuré pour l’instance `decindustrie.3cx.no:5001`. L’utilisation sur un autre serveur 3CX demande d’adapter les URL du thème et du script.

## Utilisation

Le petit panneau en haut donne accès aux réglages, aux favoris et à la galerie. La flèche permet de le replier.

Survole un message pour afficher son épingle. Dans les favoris, le bouton **note** ajoute une note personnelle ; clique sur une note existante pour la modifier. Cliquer sur le contenu d’une carte, dans les favoris ou la galerie, te ramène au message d’origine.

Les favoris et notes sont enregistrés **dans ce navigateur, pour le compte connecté**. La galerie se complète à mesure que tu remontes l’historique de la conversation.

## Mises à jour

- **Script JavaScript** : laisse les mises à jour automatiques activées dans Tampermonkey. Leur fréquence dépend de ses réglages. Recharge 3CX après une mise à jour du script.
- **CSS** : vérification à chaque chargement de 3CX, puis toutes les **30 minutes**, avec application directe.
- Un petit message indique lorsqu’une mise à jour a été appliquée.

Pour mettre à jour manuellement, rouvre le [lien d’installation](https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js), confirme la mise à jour dans Tampermonkey, puis recharge 3CX.
