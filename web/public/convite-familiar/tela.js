// A ativação de acesso familiar está desligada no servidor, e esta página não tenta
// executá-la: prometer "crie sua senha" para receber 503 é desonesto com quem chega aqui
// depois de uma noite ruim. O que resta de código faz uma única coisa, e é de higiene:
// tirar da URL e do histórico o token que possa ter vindo num link antigo de convite.
history.replaceState(null, '', '/convite-familiar/');
