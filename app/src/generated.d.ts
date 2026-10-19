// Type du fichier produit par `npm run data` (déclaré ici pour ne pas faire inférer
// à TypeScript un type depuis un JSON volumineux, et pour typer le build même sans le fichier).
declare module '*/generated/data.json' {
  const data: import('./types').AppData;
  export default data;
}
