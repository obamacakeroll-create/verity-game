const params = new URLSearchParams(location.search);

if (params.has('lookdev')) {
  import('./dev/lookdev.js').then((m) => m.lookdev());
}
