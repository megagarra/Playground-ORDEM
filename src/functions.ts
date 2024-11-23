// functions.js
export const functions = [
    {
        name: "create_order",
        description: "Cria uma nova ordem de serviço.",
        parameters: {
            type: "object",
            properties: {
                tipo_servico: { type: "string", description: "Tipo de serviço a ser realizado." },
                nome_cliente: { type: "string", description: "Nome do cliente." },
                endereco_cliente: { type: "string", description: "Endereço do cliente." },
                data_hora_agendados: { type: "string", description: "Data e hora agendadas para o serviço (formato: AAAA-MM-DD HH:MM)." },
                hora: { type: "string", description: "Hora específica do serviço." },
                descricao_servico: { type: "string", description: "Descrição detalhada do serviço." },
                funcionario_responsavel: { type: "string", description: "Nome do funcionário responsável pelo serviço." },
                status: { type: "string", description: "Status da ordem de serviço." }
            },
            required: ["tipo_servico", "nome_cliente", "endereco_cliente", "data_hora_agendados", "descricao_servico", "funcionario_responsavel", "status"]
        }
    },
    {
        name: "update_order",
        description: "Atualiza uma ordem de serviço existente.",
        parameters: {
            type: "object",
            properties: {
                orderId: { type: "string", description: "ID da ordem de serviço a ser atualizada." },
                tipo_servico: { type: "string", description: "Tipo de serviço a ser realizado." },
                nome_cliente: { type: "string", description: "Nome do cliente." },
                endereco_cliente: { type: "string", description: "Endereço do cliente." },
                data_hora_agendados: { type: "string", description: "Data e hora agendadas para o serviço (formato: AAAA-MM-DD HH:MM)." },
                hora: { type: "string", description: "Hora específica do serviço." },
                descricao_servico: { type: "string", description: "Descrição detalhada do serviço." },
                funcionario_responsavel: { type: "string", description: "Nome do funcionário responsável pelo serviço." },
                status: { type: "string", description: "Status da ordem de serviço." }
            },
            required: ["orderId"]
        }
    },
    {
        name: "delete_order",
        description: "Exclui uma ordem de serviço existente.",
        parameters: {
            type: "object",
            properties: {
                orderId: { type: "string", description: "ID da ordem de serviço a ser excluída." }
            },
            required: ["orderId"]
        }
    },
    {
        name: "get_order",
        description: "Obtém os detalhes de uma ordem de serviço específica.",
        parameters: {
            type: "object",
            properties: {
                orderId: { type: "string", description: "ID da ordem de serviço a ser obtida." }
            },
            required: ["orderId"]
        }
    },
    {
        name: "list_orders",
        description: "Lista todas as ordens de serviço existentes.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
];
