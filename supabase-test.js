const supabase = require('./supabase');

async function test() {
    const { data, error } = await supabase
        .from('projects')
        .select('*');

    if (error) {
        console.log("❌ Erreur :", error);
        return;
    }

    console.log("✅ Connexion réussie !");
    console.log(data);
}

test();