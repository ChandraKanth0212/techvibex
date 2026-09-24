from src.synthetic.simulator import simulator_instance


def test_simulation_tick_moves_trains():
    initial_tel = list(simulator_instance.active_telemetry.values())[0]
    initial_dist = initial_tel.distance_in_section_km
    
    updated = simulator_instance.tick()
    assert len(updated) > 0
    
    updated_tel = next(t for t in updated if t.train_number == initial_tel.train_number)
    assert updated_tel.distance_in_section_km > initial_dist
