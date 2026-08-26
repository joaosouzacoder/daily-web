// Service worker mínimo. Existe por dois motivos: o Chrome só oferece
// "Instalar" para uma página que registra um, e ele é o ponto de partida do
// PWA que vem depois.
//
// Deliberadamente não guarda nada em cache. Este painel mostra e-mail, agenda
// e tarefas de agora — servir uma cópia velha seria pior do que mostrar erro
// de rede. Cache offline entra quando houver uma estratégia por rota que
// saiba o que pode envelhecer e o que não pode.

self.addEventListener('install', () => {
  // Assume o controle na primeira carga, em vez de esperar a próxima visita.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Um handler de fetch é parte do critério de instalação do Chrome. Este
  // repassa a requisição sem tocar nela.
  event.respondWith(fetch(event.request));
});
