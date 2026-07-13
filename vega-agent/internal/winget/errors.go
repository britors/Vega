package winget

import "fmt"

var localizedErrors = map[int]string{
	-1978335217: "A fonte do WinGet está incompleta. Atualize ou redefina as fontes e tente novamente.",
	-1978335216: "Nenhum instalador é compatível com este sistema ou escopo.",
	-1978335215: "A verificação de integridade do instalador falhou.",
	-1978335212: "Nenhum pacote corresponde ao ID e à origem informados.",
	-1978335210: "Mais de um pacote correspondeu à consulta; a operação foi bloqueada.",
	-1978335209: "O manifesto exato do pacote não foi encontrado.",
	-1978335207: "A operação requer privilégios administrativos.",
	-1978335174: "A operação foi bloqueada por uma política da organização.",
	-1978335167: "Os contratos do pacote precisam ser aceitos antes da instalação.",
	-1978335162: "Os contratos da fonte precisam ser aceitos antes de continuar.",
	-1978334969: "Sem conexão de rede para concluir a instalação.",
	-1978334967: "A instalação terminou e requer reinicialização.",
	-1978334964: "A instalação foi cancelada pelo usuário.",
	-1978335113: "A autenticação foi cancelada pelo usuário.",
	-1978335123: "Um serviço necessário do WinGet está indisponível. Tente novamente.",
}

func wingetError(code int) error {
	if message, ok := localizedErrors[code]; ok {
		return fmt.Errorf("%s (WinGet %d)", message, code)
	}
	return fmt.Errorf("O WinGet falhou com o código %d. Consulte os logs do App Installer.", code)
}
