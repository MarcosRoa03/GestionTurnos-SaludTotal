//models/Turno.js//
const pool = require('../db').getPool();

const Turno = {
    estaDisponible: async (profesional_id, especialidad_id, fecha, hora) => {
        try {
            const [result] = await pool.execute(`
                SELECT COUNT(*) AS cantidad
                FROM Turno
                WHERE profesional_id = ? AND especialidad_id = ? AND FechaTurno = ? AND HoraTurno = ?
                AND estado IN ('Confirmado', 'En espera', 'Atendido')
            `, [profesional_id, especialidad_id, fecha, hora]);

            return result[0].cantidad === 0;
        } catch (error) {
            console.error("❌ Error al verificar disponibilidad:", error.message);
            throw error;
        }
    },

    crear: async (paciente_id, profesional_id, especialidad_id, fecha, hora) => {
        try {
            const [turnoExistente] = await pool.execute(`
                SELECT * FROM Turno 
                WHERE profesional_id = ? AND FechaTurno = ? AND HoraTurno = ?
            `, [profesional_id, fecha, hora]);

            if (turnoExistente.length > 0) {
                const error = new Error('Turno ya ocupado');
                error.status = 409;
                throw error;
            }

            const [resultado] = await pool.execute(`
                INSERT INTO Turno (paciente_id, profesional_id, especialidad_id, FechaTurno, HoraTurno, estado)
                VALUES (?, ?, ?, ?, ?, 'En espera')
            `, [paciente_id, profesional_id, especialidad_id, fecha, hora]);

            await pool.execute(`
                INSERT INTO HistorialTurno (turno_id, paciente_id, estado_nuevo)
                VALUES (?, ?, ?)
            `, [resultado.insertId, paciente_id, 'En espera']);

            return {
                id_turno: resultado.insertId,
                paciente_id,
                profesional_id,
                especialidad_id,
                FechaTurno: fecha,
                HoraTurno: hora,
                estado: 'En espera'
            };
        } catch (error) {
            console.error("❌ Error al crear turno:", error.message);
            throw error;
        }
    },

    obtenerPorPaciente: async (paciente_id) => {
        try {
            const [turnos] = await pool.execute(`
                SELECT 
                    T.id_turno AS id_turno,
                    T.FechaTurno AS fecha,
                    T.HoraTurno AS hora,
                    T.estado AS estado,
                    E.nombreEspecialidad AS especialidad,
                    P.nombre_completo AS profesional
                FROM Turno T
                JOIN Especialidad E ON T.especialidad_id = E.id_especialidad
                JOIN Profesional P ON T.profesional_id = P.id_profesional
                WHERE T.paciente_id = ?
                ORDER BY T.FechaTurno DESC, T.HoraTurno DESC
            `, [paciente_id]);

            return turnos;
        } catch (error) {
            console.error("❌ Error al obtener turnos del paciente:", error.message);
            throw error;
        }
    },

    obtenerHorariosDisponibles: async (profesional_id, especialidad_id, fecha) => {
        try {
            const [horarios] = await pool.execute(`
                SELECT HoraInicio, HoraFin  
                FROM HorarioDisponible 
                WHERE profesional_id = ? AND especialidad_id = ?  
                AND DiaSemana = ELT(WEEKDAY(STR_TO_DATE(?, '%Y-%m-%d')) + 1, 
                    'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo')
            `, [profesional_id, especialidad_id, fecha]);

            return horarios;
        } catch (error) {
            console.error("❌ Error al obtener horarios disponibles:", error.message);
            throw error;
        }
    },

    obtenerTurnosOcupados: async (profesional_id, especialidad_id, fecha) => {
        try {
            const [ocupados] = await pool.execute(`
                SELECT HoraTurno 
                FROM Turno 
                WHERE profesional_id = ? AND especialidad_id = ? AND FechaTurno = ?
                AND estado IN ('Confirmado', 'En espera', 'Atendido')
            `, [profesional_id, especialidad_id, fecha]);

            return ocupados.map(t => t.HoraTurno);
        } catch (error) {
            console.error('❌ Error al obtener turnos ocupados:', error.message);
            throw error;
        }
    },

    cancelarTurno: async (id_turno, paciente_id) => {
        try {
            const [resultado] = await pool.execute(`
                UPDATE Turno
                SET estado = 'Cancelado'
                WHERE id_turno = ? AND paciente_id = ?
            `, [id_turno, paciente_id]);

            await pool.execute(`
                INSERT INTO HistorialTurno (turno_id, paciente_id, estado_nuevo)
                VALUES (?, ?, ?)
            `, [id_turno, paciente_id, 'Cancelado']);

            if (resultado.affectedRows === 0) {
                throw new Error('No se encontró el turno o no pertenece al paciente');
            }

            return { message: '✅ Turno cancelado correctamente' };
        } catch (error) {
            console.error('❌ Error al cancelar turno:', error.message);
            throw error;
        }
    },

    obtenerProximosTurnos: async (paciente_id) => {
        try {
            const [turnos] = await pool.execute(`
                SELECT 
                    T.id_turno AS id_turno,
                    T.FechaTurno AS fecha,
                    T.HoraTurno AS hora,
                    T.estado AS estado,
                    E.nombreEspecialidad AS especialidad,
                    P.nombre_completo AS profesional
                FROM Turno T
                JOIN Especialidad E ON T.especialidad_id = E.id_especialidad
                JOIN Profesionales P ON T.profesional_id = P.id_profesional
                WHERE T.paciente_id = ? 
                  AND T.estado IN ('En espera', 'Confirmado')
                  AND T.FechaTurno >= CURDATE()
                ORDER BY T.FechaTurno ASC, T.HoraTurno ASC
                LIMIT 1
            `, [paciente_id]);

            return turnos[0] || null;
        } catch (error) {
            console.error('❌ Error al obtener próximo turno:', error.message);
            throw error;
        }
    }
};

module.exports = Turno;
